// SMTP mailer — C173 (env-only), refactorizado en C176 para leer config
// desde la tabla `settings` con fallback a variables de entorno.
//
// Catálogo de keys en settings (cifradas vs plano según naturaleza del dato):
//   - smtp_host        plano
//   - smtp_port        plano
//   - smtp_secure      plano ("true"|"false")
//   - smtp_user        plano
//   - smtp_pass        CIFRADO (AES-256-GCM via crypto.js)
//   - smtp_from        plano
//   - smtp_reply_to    plano
//   - smtp_enabled     plano ("true"|"false"|"auto")
//
// Las env vars (SMTP_HOST, SMTP_PORT, ..., MAIL_FROM, MAIL_ENABLED) actúan
// como fallback de bootstrap cuando la BD aún no tiene config (primer arranque
// o entorno de desarrollo sin .env personalizado).
//
// sendMail({to, subject, html, text}) retorna una Promise que SIEMPRE resuelve;
// los fallos se loguean pero nunca propagan para que los callers (POST /api/orders)
// puedan hacer fire-and-forget sin riesgo de afectar la respuesta al usuario.
//
// La configuración se cachea en memoria con TTL corto; un POST/DELETE al endpoint
// admin invalida el cache vía `invalidateCache()` para que el siguiente envío
// use credenciales frescas sin reiniciar el backend.

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}

const { query } = require('../models/database');
const { decrypt } = require('./crypto');

const CACHE_TTL_MS = 30_000;
let configCache = null;
let configCacheExpiresAt = 0;
let transport = null;

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === 'true' || lowered === '1' || lowered === 'yes') return true;
  if (lowered === 'false' || lowered === '0' || lowered === 'no') return false;
  return fallback;
}

const SMTP_KEYS = [
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'smtp_reply_to',
  'smtp_enabled',
];

async function readDbSettings() {
  try {
    const { rows } = await query(
      'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
      [SMTP_KEYS],
    );
    const map = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  } catch (err) {
    console.warn('[mailer] Could not read SMTP settings from DB:', err.message);
    return {};
  }
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

function source(dbValue, envValue) {
  if (dbValue != null && dbValue !== '') return { value: dbValue, from: 'db' };
  if (envValue != null && envValue !== '') return { value: envValue, from: 'env' };
  return { value: '', from: 'none' };
}

async function resolveConfig() {
  const db = await readDbSettings();
  const env = readEnvFallback();

  const host = source(db.smtp_host, env.host);
  const portRaw = source(db.smtp_port, env.port);
  const port = Number.parseInt(portRaw.value || '587', 10) || 587;
  // C195 ROOT CAUSE: Railway env had SMTP_PORT=465 + SMTP_SECURE=false. Port 465
  // is SMTPS (implicit TLS), so nodemailer with secure=false attempts a plain
  // SMTP greeting that the server never answers → tcp_timeout after ~15s. The
  // RFC mapping is fixed and cannot be overridden by user config:
  //   port 465 → secure=true (implicit TLS / SMTPS)
  //   port 587 → secure=false (STARTTLS)
  //   port 25  → secure=false (plain)
  // For any other port we honor the explicit setting (legacy / custom relays).
  let secure;
  if (port === 465) {
    secure = true;
  } else if (port === 587 || port === 25) {
    secure = false;
  } else {
    const explicitSecure = db.smtp_secure != null ? db.smtp_secure : env.secure;
    secure = parseBool(explicitSecure, false);
  }
  const user = source(db.smtp_user, env.user);
  // C195: env-first override for SMTP_PASS. When SMTP_PASS is set in the
  // process env we trust it over any DB-encrypted value. Rationale: the only
  // failure mode of the previous db-first policy was the ENCRYPTION_SECRET
  // mismatch (C188-C190) — the operator setting SMTP_PASS in env is making an
  // explicit override that should beat a stale ciphertext. We still report
  // dbPassPresent / decryptOk via describe() so the admin UI can surface the
  // mismatch and prompt a re-save when convenient.
  let pass = '';
  let passSource = 'none';
  const dbPassPresent = Boolean(db.smtp_pass);
  let decryptOk = null;
  if (dbPassPresent) {
    const decrypted = decrypt(db.smtp_pass);
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
  const from = source(db.smtp_from, env.from);
  const replyTo = source(db.smtp_reply_to, env.replyTo);

  const enabledRaw = (db.smtp_enabled != null ? db.smtp_enabled : (env.enabled || 'auto'))
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

async function getConfig() {
  const now = Date.now();
  if (configCache && configCacheExpiresAt > now) {
    return configCache;
  }
  configCache = await resolveConfig();
  configCacheExpiresAt = now + CACHE_TTL_MS;
  return configCache;
}

function invalidateCache() {
  configCache = null;
  configCacheExpiresAt = 0;
  transport = null;
}

// C189 (OPTION B): bound every blocking phase so a misconfigured host
// (firewall, wrong port, dropped packets) returns within ~15s instead of
// hanging the request thread for the default 10 min. Values mirror what
// Railway and Gmail SMTP traditionally need under load.
const TRANSPORT_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 8_000,
  socketTimeout: 15_000,
};

async function getTransport() {
  const config = await getConfig();
  if (!config.enabled) return { transport: null, config };
  if (transport) return { transport, config };
  transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    ...TRANSPORT_TIMEOUTS,
  });
  return { transport, config };
}

// C189: clasificar la causa del error de SMTP para que el caller (UI admin /
// log) sepa si fue cifrado, red, TLS o credenciales. Sin esto, todo error de
// nodemailer aparece como "Connection timeout" sin pista accionable.
function classifySmtpError(err, config) {
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

async function sendMail({ to, subject, html, text, replyTo }) {
  const { transport: tx, config } = await getTransport();
  if (!config.enabled || !tx) {
    // C189: distinguir SMTP simplemente apagado vs cifrado roto (ambos terminan
    // en !enabled si auto-mode no encuentra credenciales decryptables).
    if (config.dbPassPresent && config.decryptOk === false) {
      console.error(`[mailer] decrypt_failed — smtp_pass exists in DB but ENCRYPTION_SECRET cannot decrypt it. Re-save SMTP password in /admin to re-encrypt with the active secret.`);
      return { skipped: true, reason: 'decrypt_failed' };
    }
    console.log(`[mailer] SMTP disabled — skipping mail to ${to} ("${subject}")`);
    return { skipped: true, reason: 'smtp_disabled' };
  }
  if (!to) {
    console.warn('[mailer] sendMail called without "to" — skipping');
    return { skipped: true, reason: 'missing_to' };
  }

  try {
    const info = await tx.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
      replyTo: replyTo || config.replyTo || undefined,
    });
    console.log(`[mailer] sent to=${to} subject="${subject}" messageId=${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const reason = classifySmtpError(err, config);
    console.error(`[mailer] sendMail failed to=${to} subject="${subject}" reason=${reason}: ${err.message}`);
    return { ok: false, error: err.message, reason };
  }
}

// C189: probe SMTP por capas sin enviar correo — útil para botón "Verificar
// conexión" en /admin y para describe?verify=true. Reporta dónde rompe.
async function verifyConnection() {
  const config = await getConfig();
  const result = {
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
    ({ transport: tx } = await getTransport());
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
    result.reason = classifySmtpError(err, config);
    result.error = err.message;
    return result;
  }
}

async function isEnabled() {
  const config = await getConfig();
  return config.enabled;
}

async function describe() {
  const config = await getConfig();
  return {
    enabled: config.enabled,
    host: config.host || null,
    port: config.port,
    secure: config.secure,
    from: config.from || null,
    replyTo: config.replyTo,
    hasAuth: Boolean(config.user),
    // C189: surface decrypt status so admin UI shows actionable error
    // ("re-grabar contraseña") instead of generic "SMTP disabled".
    dbPassPresent: config.dbPassPresent,
    decryptOk: config.decryptOk,
    sources: config.sources,
  };
}

async function sendTestMail(to) {
  if (!to) return { ok: false, error: 'missing_to' };
  const subject = 'amaCafe — Prueba SMTP';
  const text = 'Si recibes este correo, la configuración SMTP de amaCafe está funcionando correctamente.';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h2 style="color:#7c4a1e;margin:0 0 12px">amaCafe — Prueba SMTP ✅</h2>
      <p>Si estás leyendo este correo, la configuración SMTP de amaCafe está funcionando correctamente.</p>
      <p style="color:#666;font-size:12px">Enviado desde el panel de administración de amaCafe.</p>
    </div>
  `;
  return sendMail({ to, subject, text, html });
}

module.exports = {
  sendMail,
  sendTestMail,
  isEnabled,
  describe,
  verifyConnection,
  invalidateCache,
};
