// Resend transport — C200 OPTION B.
// HTTPS-only email delivery via api.resend.com — sortea bloqueos de TCP egress
// SMTP (puertos 25/465/587) que ocurren en plataformas como Railway. Requiere
// dominio verificado en https://resend.com/domains para que `from` no sea
// rechazado.
//
// API contract:
//   POST https://api.resend.com/emails
//     Authorization: Bearer <key>
//     Body: { from, to, subject, html, text, reply_to }
//   200 → { id }
//   401 → key inválida
//   422 → dominio no verificado o payload inválido
//   429 → rate limit
//
// Verify connection: GET https://api.resend.com/domains (200 si key válida).

const { decrypt } = require('../crypto');

const RESEND_API_BASE = 'https://api.resend.com';
const REQUEST_TIMEOUT_MS = 15_000;

function source(dbValue, envValue) {
  if (dbValue != null && dbValue !== '') return { value: dbValue, from: 'db' };
  if (envValue != null && envValue !== '') return { value: envValue, from: 'env' };
  return { value: '', from: 'none' };
}

function readEnvFallback() {
  return {
    apiKey: process.env.RESEND_API_KEY || '',
    from: (process.env.MAIL_FROM || '').trim(),
    replyTo: (process.env.MAIL_REPLY_TO || '').trim(),
  };
}

function resolveConfig(dbMap) {
  const env = readEnvFallback();

  // Env wins over DB (consistente con C195 env-first para credenciales).
  let apiKey = '';
  let apiKeySource = 'none';
  const dbKeyPresent = Boolean(dbMap.resend_api_key);
  let decryptOk = null;
  if (dbKeyPresent) {
    const decrypted = decrypt(dbMap.resend_api_key);
    decryptOk = Boolean(decrypted);
    if (decrypted) {
      apiKey = decrypted;
      apiKeySource = 'db';
    }
  }
  if (env.apiKey) {
    apiKey = env.apiKey;
    apiKeySource = 'env';
  }

  const from = source(dbMap.mail_from || dbMap.smtp_from, env.from);
  const replyTo = source(dbMap.mail_reply_to || dbMap.smtp_reply_to, env.replyTo);

  const enabled = Boolean(apiKey && from.value);

  return {
    provider: 'resend',
    apiKey,
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : null,
    from: from.value,
    replyTo: replyTo.value || null,
    enabled,
    dbKeyPresent,
    decryptOk,
    sources: {
      apiKey: apiKeySource,
      from: from.from,
      replyTo: replyTo.from,
    },
  };
}

function classifyError(status, body) {
  if (status === 0) return 'tcp_timeout';
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 422) {
    const msg = String(body?.message || '').toLowerCase();
    if (msg.includes('domain')) return 'domain_unverified';
    return 'invalid_payload';
  }
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

async function resendFetch(path, { method, apiKey, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${RESEND_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 0, body: null, error: 'request_timeout' };
    }
    return { status: 0, body: null, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function sendMail(config, { to, subject, html, text, replyTo }) {
  if (!config.enabled) {
    if (config.dbKeyPresent && config.decryptOk === false) {
      console.error('[mailer:resend] decrypt_failed — resend_api_key exists in DB but ENCRYPTION_SECRET cannot decrypt it. Re-save via /admin.');
      return { skipped: true, reason: 'decrypt_failed' };
    }
    return { skipped: true, reason: 'resend_disabled' };
  }
  const payload = {
    from: config.from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };
  const finalReplyTo = replyTo || config.replyTo;
  if (finalReplyTo) payload.reply_to = finalReplyTo;

  const { status, body, error } = await resendFetch('/emails', {
    method: 'POST',
    apiKey: config.apiKey,
    body: payload,
  });

  if (status >= 200 && status < 300 && body?.id) {
    console.log(`[mailer:resend] sent to=${to} subject="${subject}" messageId=${body.id}`);
    return { ok: true, messageId: body.id };
  }

  const reason = classifyError(status, body);
  const errMsg = body?.message || error || `http_${status}`;
  console.error(`[mailer:resend] sendMail failed to=${to} subject="${subject}" reason=${reason} status=${status}: ${errMsg}`);
  return { ok: false, error: errMsg, reason, status };
}

async function verifyConnection(config) {
  const result = {
    provider: 'resend',
    decryptOk: config.decryptOk,
    hasAuth: Boolean(config.apiKey),
    transportReady: false,
    verified: false,
    reason: null,
    error: null,
  };
  if (config.dbKeyPresent && config.decryptOk === false) {
    result.reason = 'decrypt_failed';
    return result;
  }
  if (!config.enabled) {
    result.reason = 'resend_disabled';
    return result;
  }
  result.transportReady = true;
  const { status, body, error } = await resendFetch('/domains', {
    method: 'GET',
    apiKey: config.apiKey,
  });
  if (status >= 200 && status < 300) {
    result.verified = true;
    return result;
  }
  result.reason = classifyError(status, body);
  result.error = body?.message || error || `http_${status}`;
  return result;
}

function describe(config) {
  return {
    provider: 'resend',
    enabled: config.enabled,
    from: config.from || null,
    replyTo: config.replyTo,
    hasAuth: Boolean(config.apiKey),
    apiKeyMasked: config.apiKeyMasked,
    dbKeyPresent: config.dbKeyPresent,
    decryptOk: config.decryptOk,
    sources: config.sources,
  };
}

function invalidateCache() {
  // Resend es stateless — no hay transport persistente.
}

module.exports = {
  KEYS: ['resend_api_key', 'mail_provider', 'mail_from', 'mail_reply_to'],
  resolveConfig,
  sendMail,
  verifyConnection,
  describe,
  invalidateCache,
};
