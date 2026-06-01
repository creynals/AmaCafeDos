// SMTP transport — extraído de mailer.js en C200 (OPTION B: Resend migration).
// Preserva la lógica RFC 465/587/25 (C195) y la clasificación de errores (C189).
// El selector en mailer.js decide cuándo usar este transport vs Resend HTTPS.

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

const { decrypt } = require('../crypto');

const TRANSPORT_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 8_000,
  socketTimeout: 15_000,
};

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === 'true' || lowered === '1' || lowered === 'yes') return true;
  if (lowered === 'false' || lowered === '0' || lowered === 'no') return false;
  return fallback;
}

function source(dbValue, envValue) {
  if (dbValue != null && dbValue !== '') return { value: dbValue, from: 'db' };
  if (envValue != null && envValue !== '') return { value: envValue, from: 'env' };
  return { value: '', from: 'none' };
}

function readEnvFallback() {
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: (process.env.SMTP_PORT || '').trim(),
    secure: process.env.SMTP_SECURE,
    user: (process.env.SMTP_USER || '').trim(),
    pass: process.env.SMTP_PASS || '',
    from: (process.env.MAIL_FROM || '').trim(),
    replyTo: (process.env.MAIL_REPLY_TO || '').trim(),
    enabled: process.env.MAIL_ENABLED,
  };
}

function resolveConfig(dbMap) {
  const env = readEnvFallback();

  const host = source(dbMap.smtp_host, env.host);
  const portRaw = source(dbMap.smtp_port, env.port);
  const port = Number.parseInt(portRaw.value || '587', 10) || 587;
  // C195: RFC mapping for port→secure cannot be overridden by user config.
  //   port 465 → secure=true (implicit TLS / SMTPS)
  //   port 587 → secure=false (STARTTLS)
  //   port 25  → secure=false (plain)
  let secure;
  if (port === 465) {
    secure = true;
  } else if (port === 587 || port === 25) {
    secure = false;
  } else {
    const explicitSecure = dbMap.smtp_secure != null ? dbMap.smtp_secure : env.secure;
    secure = parseBool(explicitSecure, false);
  }
  const user = source(dbMap.smtp_user, env.user);
  // C195: env-first override for SMTP_PASS.
  let pass = '';
  let passSource = 'none';
  const dbPassPresent = Boolean(dbMap.smtp_pass);
  let decryptOk = null;
  if (dbPassPresent) {
    const decrypted = decrypt(dbMap.smtp_pass);
    decryptOk = Boolean(decrypted);
    if (decrypted) {
      pass = decrypted;
      passSource = 'db';
    }
  }
  if (env.pass) {
    pass = env.pass;
    passSource = 'env';
  }
  const from = source(dbMap.smtp_from, env.from);
  const replyTo = source(dbMap.smtp_reply_to, env.replyTo);

  const enabledRaw = (dbMap.smtp_enabled != null ? dbMap.smtp_enabled : (env.enabled || 'auto'))
    .toString()
    .trim()
    .toLowerCase();

  let enabled;
  if (enabledRaw === 'auto' || enabledRaw === '') {
    enabled = Boolean(host.value && (from.value || user.value) && nodemailer);
  } else {
    enabled = parseBool(enabledRaw, false) && Boolean(host.value && (from.value || user.value) && nodemailer);
  }

  return {
    provider: 'smtp',
    host: host.value,
    port,
    secure,
    user: user.value,
    pass,
    from: from.value || user.value,
    replyTo: replyTo.value || null,
    enabled,
    dbPassPresent,
    decryptOk,
    sources: {
      host: host.from,
      port: portRaw.from,
      user: user.from,
      pass: passSource,
      from: from.from,
      replyTo: replyTo.from,
    },
  };
}

// C189: clasificar la causa del error de SMTP para que el caller (UI admin /
// log) sepa si fue cifrado, red, TLS o credenciales.
function classifyError(err, config) {
  if (!err) return 'unknown';
  const code = err.code || '';
  const command = err.command || '';
  const responseCode = err.responseCode;

  if (config && config.dbPassPresent && config.decryptOk === false) {
    return 'decrypt_failed';
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(err.message || '')) return 'tcp_timeout';
  if (code === 'ECONNREFUSED') return 'tcp_refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_failed';
  if (code === 'ESOCKET' || /tls|ssl|certificate/i.test(err.message || '')) return 'tls_failed';
  if (responseCode === 535 || command === 'AUTH' || /auth/i.test(err.message || '')) return 'auth_failed';
  return 'unknown';
}

let cachedTransport = null;

function getTransport(config) {
  if (!config.enabled) return null;
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    ...TRANSPORT_TIMEOUTS,
  });
  return cachedTransport;
}

async function sendMail(config, { to, subject, html, text, replyTo }) {
  if (!config.enabled) {
    if (config.dbPassPresent && config.decryptOk === false) {
      console.error('[mailer:smtp] decrypt_failed — smtp_pass exists in DB but ENCRYPTION_SECRET cannot decrypt it. Re-save SMTP password in /admin.');
      return { skipped: true, reason: 'decrypt_failed' };
    }
    return { skipped: true, reason: 'smtp_disabled' };
  }
  const tx = getTransport(config);
  if (!tx) return { skipped: true, reason: 'transport_unavailable' };
  try {
    const info = await tx.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || config.replyTo || undefined,
    });
    console.log(`[mailer:smtp] sent to=${to} subject="${subject}" messageId=${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const reason = classifyError(err, config);
    console.error(`[mailer:smtp] sendMail failed to=${to} subject="${subject}" reason=${reason}: ${err.message}`);
    return { ok: false, error: err.message, reason };
  }
}

async function verifyConnection(config) {
  const result = {
    provider: 'smtp',
    decryptOk: config.decryptOk,
    hasAuth: Boolean(config.user),
    transportReady: false,
    verified: false,
    reason: null,
    error: null,
  };
  if (config.dbPassPresent && config.decryptOk === false) {
    result.reason = 'decrypt_failed';
    return result;
  }
  if (!config.enabled) {
    result.reason = 'smtp_disabled';
    return result;
  }
  let tx;
  try {
    tx = getTransport(config);
    result.transportReady = Boolean(tx);
  } catch (err) {
    result.reason = 'transport_init_failed';
    result.error = err.message;
    return result;
  }
  if (!tx) {
    result.reason = 'transport_unavailable';
    return result;
  }
  try {
    await tx.verify();
    result.verified = true;
    return result;
  } catch (err) {
    result.reason = classifyError(err, config);
    result.error = err.message;
    return result;
  }
}

function describe(config) {
  return {
    provider: 'smtp',
    enabled: config.enabled,
    host: config.host || null,
    port: config.port,
    secure: config.secure,
    from: config.from || null,
    replyTo: config.replyTo,
    hasAuth: Boolean(config.user),
    dbPassPresent: config.dbPassPresent,
    decryptOk: config.decryptOk,
    sources: config.sources,
  };
}

function invalidateCache() {
  cachedTransport = null;
}

module.exports = {
  KEYS: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_reply_to', 'smtp_enabled'],
  resolveConfig,
  sendMail,
  verifyConnection,
  describe,
  invalidateCache,
};
