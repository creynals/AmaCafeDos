// Mailer facade — C200 OPTION B: Migración a Resend (API HTTPS).
//
// Selector entre dos transports:
//   - smtp:   nodemailer sobre puertos 25/465/587 (C173/C189/C195)
//   - resend: HTTPS POST https://api.resend.com/emails (sortea bloqueo egress
//             TCP de plataformas como Railway)
//
// Resolución de provider (en orden):
//   1. settings.mail_provider o env MAIL_PROVIDER ∈ {smtp,resend}
//   2. settings.resend_api_key o env RESEND_API_KEY presente → 'resend'
//   3. fallback → 'smtp'
//
// API pública preservada (consumida por routes/settings.js, routes/orders.js,
// server.js, encryption-health.js):
//   - sendMail({to, subject, html, text, replyTo})
//   - sendTestMail(to)
//   - verifyConnection()
//   - describe()
//   - isEnabled()
//   - invalidateCache()
//
// sendMail SIEMPRE resuelve (nunca throw); los fallos se loguean para que
// callers fire-and-forget (POST /api/orders) no fallen por email.

const { query } = require('../models/database');
const smtpTransport = require('./transports/smtp');
const resendTransport = require('./transports/resend');

const CACHE_TTL_MS = 30_000;
const ALL_KEYS = Array.from(new Set([...smtpTransport.KEYS, ...resendTransport.KEYS]));
const VALID_PROVIDERS = ['smtp', 'resend'];

let cache = null;
let cacheExpiresAt = 0;

async function readDbSettings() {
  try {
    const { rows } = await query(
      'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
      [ALL_KEYS],
    );
    const map = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  } catch (err) {
    console.warn('[mailer] Could not read mail settings from DB:', err.message);
    return {};
  }
}

function pickProvider(dbMap) {
  const explicit = (dbMap.mail_provider || process.env.MAIL_PROVIDER || '').toString().trim().toLowerCase();
  if (VALID_PROVIDERS.includes(explicit)) return explicit;
  const hasResendKey = Boolean(dbMap.resend_api_key) || Boolean(process.env.RESEND_API_KEY);
  if (hasResendKey) return 'resend';
  return 'smtp';
}

async function resolveAll() {
  const dbMap = await readDbSettings();
  const provider = pickProvider(dbMap);
  const transport = provider === 'resend' ? resendTransport : smtpTransport;
  const config = transport.resolveConfig(dbMap);
  return { provider, transport, config };
}

async function getResolved() {
  const now = Date.now();
  if (cache && cacheExpiresAt > now) return cache;
  cache = await resolveAll();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cache;
}

function invalidateCache() {
  cache = null;
  cacheExpiresAt = 0;
  smtpTransport.invalidateCache();
  resendTransport.invalidateCache();
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to) {
    console.warn('[mailer] sendMail called without "to" — skipping');
    return { skipped: true, reason: 'missing_to' };
  }
  const { provider, transport, config } = await getResolved();
  if (!config.enabled) {
    if (config.dbPassPresent && config.decryptOk === false) {
      return { skipped: true, reason: 'decrypt_failed', provider };
    }
    if (config.dbKeyPresent && config.decryptOk === false) {
      return { skipped: true, reason: 'decrypt_failed', provider };
    }
    console.log(`[mailer] provider=${provider} disabled — skipping mail to ${to} ("${subject}")`);
    return { skipped: true, reason: `${provider}_disabled`, provider };
  }
  const result = await transport.sendMail(config, { to, subject, html, text, replyTo });
  return { ...result, provider };
}

async function verifyConnection() {
  const { provider, transport, config } = await getResolved();
  const result = await transport.verifyConnection(config);
  return { ...result, provider };
}

async function describe() {
  const { provider, transport, config } = await getResolved();
  const base = transport.describe(config);
  return { ...base, provider };
}

async function isEnabled() {
  const { config } = await getResolved();
  return config.enabled;
}

async function sendTestMail(to) {
  if (!to) return { ok: false, error: 'missing_to' };
  const subject = 'amaCafe — Prueba de envío';
  const text = 'Si recibes este correo, la configuración de mailer (SMTP o Resend) de amaCafe está funcionando correctamente.';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
      <h2 style="color:#7c4a1e;margin:0 0 12px">amaCafe — Prueba de envío ✅</h2>
      <p>Si estás leyendo este correo, la configuración de mailer de amaCafe está funcionando correctamente.</p>
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
