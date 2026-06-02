const express = require('express');
const { query } = require('../models/database');
const { encrypt, decrypt } = require('../utils/crypto');
const { getModelConfig, saveModelConfig, fetchAvailableModels, DEFAULT_MODEL, FALLBACK_MODEL } = require('../utils/openrouter');
const { getRecaptchaConfig, saveRecaptchaConfig } = require('../utils/recaptcha');
const {
  getModeWithSource: getSumupModeWithSource,
  getReturnUrlBaseWithSource: getSumupReturnUrlBaseWithSource,
} = require('../utils/sumup.config');
const { validateRut, formatRut } = require('../utils/rut');
const { buildOrderConfirmationEmail } = require('../utils/orderConfirmationEmail');
const { resolveLogoUrl } = require('../utils/mailAssets');
const {
  BANK_KEYS,
  ACCOUNT_TYPES,
  BANK_NAMES,
  readBankKey,
  writeBankKey,
  readBankSettings,
  isBankConfigured,
} = require('../utils/bankSettings');

const router = express.Router();

router.get('/admin/settings/ai-status', async (req, res) => {
  const { rows } = await query('SELECT value, updated_at FROM settings WHERE key = $1', ['openrouter_api_key']);
  const row = rows[0];
  const models = await getModelConfig();

  if (!row) {
    return res.json({
      configured: false,
      models,
      provider: 'OpenRouter',
    });
  }

  const decrypted = decrypt(row.value);
  const masked = decrypted
    ? decrypted.slice(0, 6) + '...' + decrypted.slice(-4)
    : null;

  res.json({
    configured: !!decrypted,
    maskedKey: masked,
    models,
    provider: 'OpenRouter',
    updatedAt: row.updated_at,
  });
});

router.post('/admin/settings/api-key', async (req, res) => {
  const { api_key } = req.body;

  if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
    return res.status(400).json({ error: 'API key invalida' });
  }

  const encrypted = encrypt(api_key.trim());

  await query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()
  `, ['openrouter_api_key', encrypted]);

  const masked = api_key.trim().slice(0, 6) + '...' + api_key.trim().slice(-4);

  res.json({
    success: true,
    message: 'API key de OpenRouter guardada y encriptada correctamente',
    maskedKey: masked,
  });
});

router.delete('/admin/settings/api-key', async (req, res) => {
  await query('DELETE FROM settings WHERE key = $1', ['openrouter_api_key']);
  res.json({ success: true, message: 'API key eliminada' });
});

router.get('/admin/settings/models', async (req, res) => {
  try {
    const models = await fetchAvailableModels();
    res.json({ models });
  } catch (err) {
    console.error('Error fetching models:', err.message);
    if (err.message === 'OPENROUTER_API_KEY_NOT_CONFIGURED') {
      return res.status(400).json({ error: 'API key no configurada' });
    }
    res.status(500).json({ error: 'Error al obtener modelos disponibles' });
  }
});

router.post('/admin/settings/model', async (req, res) => {
  const { agent, model } = req.body;

  if (!agent || !['customer', 'admin', 'fallback'].includes(agent)) {
    return res.status(400).json({ error: 'Agente inválido. Usar: customer, admin, o fallback' });
  }
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'Modelo inválido' });
  }

  await saveModelConfig(agent, model);

  const models = await getModelConfig();
  res.json({
    success: true,
    message: `Modelo para ${agent} actualizado a ${model}`,
    models,
  });
});

// --- reCAPTCHA v3 Configuration ---
// Public endpoint /settings/recaptcha-config is registered directly in
// server.js, before the requireAuth-protected mount of these routes.

// Admin: ver estado de reCAPTCHA
router.get('/admin/settings/recaptcha', async (req, res) => {
  const config = await getRecaptchaConfig();
  res.json({
    enabled: config.enabled,
    siteKeyConfigured: !!config.siteKey,
    secretKeyConfigured: !!config.secretKey,
    siteKey: config.siteKey || '',
  });
});

// Admin: guardar configuración de reCAPTCHA
router.post('/admin/settings/recaptcha', async (req, res) => {
  const { site_key, secret_key, enabled } = req.body;

  const existingConfig = await getRecaptchaConfig();
  const hasExistingSecret = !!existingConfig.secretKey;

  if (enabled && (!site_key || (!secret_key && !hasExistingSecret))) {
    return res.status(400).json({
      error: 'Se requieren site_key y secret_key para habilitar reCAPTCHA',
    });
  }

  await saveRecaptchaConfig(site_key, secret_key || undefined, !!enabled);

  res.json({
    success: true,
    message: enabled ? 'reCAPTCHA v3 habilitado correctamente' : 'reCAPTCHA v3 deshabilitado',
    enabled: !!enabled,
  });
});

// Admin: deshabilitar reCAPTCHA
router.delete('/admin/settings/recaptcha', async (req, res) => {
  await saveRecaptchaConfig(undefined, undefined, false);
  res.json({ success: true, message: 'reCAPTCHA deshabilitado' });
});

// --- SumUp Credentials (Ciclo 15 — L2 coherence completa) ---
//
// Todo el catálogo SumUp vive en la tabla `settings`:
//
// Secretos cifrados (AES-256-GCM):
//   - sumup_api_key                                                  [C6]
//   - sumup_merchant_code                                            [C6]
// No-secretos en plano:
//   - sumup_app_id                                                   [C6]
//   - sumup_mode           (mock | live, caché TTL 5min)             [C15]
//   - sumup_return_url_base (URL pública, caché TTL 5min)            [C15]
//
// Env vars actúan solo como fallback de bootstrap.
// Ciclo 26 (Option A): sumup_webhook_secret removed — HMAC verification
// no longer performed (SumUp dashboard no expone signing secret).

let sumupAdapter = null;
function getSumupAdapter() {
  if (!sumupAdapter) sumupAdapter = require('../utils/sumup');
  return sumupAdapter;
}

const SUMUP_KEYS = {
  apiKey:        { key: 'sumup_api_key',        encrypted: true  },
  merchantCode:  { key: 'sumup_merchant_code',  encrypted: true  },
  appId:         { key: 'sumup_app_id',         encrypted: false },
  mode:          { key: 'sumup_mode',           encrypted: false },
  returnUrlBase: { key: 'sumup_return_url_base', encrypted: false },
};

const SUMUP_MODES = ['mock', 'live'];

function maskCredential(value) {
  if (!value) return null;
  if (value.length <= 10) return '***';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

async function readSumupSetting({ key, encrypted }) {
  const { rows } = await query('SELECT value, updated_at FROM settings WHERE key = $1', [key]);
  if (rows.length === 0) return { value: null, updatedAt: null };
  const raw = rows[0].value;
  const value = raw ? (encrypted ? decrypt(raw) : raw) : null;
  return { value, updatedAt: rows[0].updated_at };
}

async function writeSumupSetting({ key, encrypted }, value) {
  const stored = encrypted ? encrypt(value) : value;
  await query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()
  `, [key, stored]);
}

router.get('/admin/settings/sumup', async (req, res) => {
  // Ciclo 41: fuente única de verdad para mode/returnUrlBase — evita
  // duplicar la cadena de fallback (settings → env → default) que vivía
  // aquí y en sumup.config.js.
  const [api, merchant, appId, mode, returnUrlBase, modeResolved, returnUrlResolved] = await Promise.all([
    readSumupSetting(SUMUP_KEYS.apiKey),
    readSumupSetting(SUMUP_KEYS.merchantCode),
    readSumupSetting(SUMUP_KEYS.appId),
    readSumupSetting(SUMUP_KEYS.mode),
    readSumupSetting(SUMUP_KEYS.returnUrlBase),
    getSumupModeWithSource(),
    getSumupReturnUrlBaseWithSource(),
  ]);

  res.json({
    provider: 'SumUp',
    mode: {
      value: modeResolved.value,
      source: modeResolved.source,
      updatedAt: mode.updatedAt,
    },
    returnUrlBase: {
      value: returnUrlResolved.value,
      source: returnUrlResolved.source,
      updatedAt: returnUrlBase.updatedAt,
    },
    apiKey: {
      configured: !!api.value,
      masked: maskCredential(api.value),
      updatedAt: api.updatedAt,
    },
    merchantCode: {
      configured: !!merchant.value,
      masked: maskCredential(merchant.value),
      updatedAt: merchant.updatedAt,
    },
    appId: {
      configured: !!appId.value,
      value: appId.value || null,
      updatedAt: appId.updatedAt,
    },
  });
});

router.post('/admin/settings/sumup', async (req, res) => {
  const { api_key, merchant_code, app_id, mode, return_url_base } = req.body || {};

  const updates = [];
  const flags = { apiKey: false, merchantCode: false, appId: false, mode: false, returnUrlBase: false };
  // Ciclo 41: captura modo previo para audit log antes de invalidar caché.
  let previousMode = null;
  let newMode = null;

  if (api_key !== undefined) {
    if (typeof api_key !== 'string' || api_key.trim().length < 10) {
      return res.status(400).json({ error: 'api_key inválido (mínimo 10 caracteres)' });
    }
    updates.push(writeSumupSetting(SUMUP_KEYS.apiKey, api_key.trim()));
    flags.apiKey = true;
  }
  if (merchant_code !== undefined) {
    if (typeof merchant_code !== 'string' || merchant_code.trim().length < 3) {
      return res.status(400).json({ error: 'merchant_code inválido' });
    }
    updates.push(writeSumupSetting(SUMUP_KEYS.merchantCode, merchant_code.trim()));
    flags.merchantCode = true;
  }
  if (app_id !== undefined) {
    if (typeof app_id !== 'string') {
      return res.status(400).json({ error: 'app_id inválido' });
    }
    updates.push(writeSumupSetting(SUMUP_KEYS.appId, app_id.trim()));
    flags.appId = true;
  }
  if (mode !== undefined) {
    if (typeof mode !== 'string' || !SUMUP_MODES.includes(mode.trim())) {
      return res.status(400).json({ error: `mode inválido (valores permitidos: ${SUMUP_MODES.join(', ')})` });
    }
    newMode = mode.trim();
    previousMode = (await getSumupModeWithSource()).value;
    updates.push(writeSumupSetting(SUMUP_KEYS.mode, newMode));
    flags.mode = true;
  }
  if (return_url_base !== undefined) {
    if (typeof return_url_base !== 'string' || !/^https?:\/\/.+/i.test(return_url_base.trim())) {
      return res.status(400).json({ error: 'return_url_base inválido (debe iniciar con http:// o https://)' });
    }
    updates.push(writeSumupSetting(SUMUP_KEYS.returnUrlBase, return_url_base.trim().replace(/\/$/, '')));
    flags.returnUrlBase = true;
  }

  if (updates.length === 0) {
    return res.status(400).json({
      error: 'Nada que actualizar (api_key, merchant_code, app_id, mode o return_url_base)',
    });
  }

  await Promise.all(updates);

  const adapter = getSumupAdapter();
  if (flags.mode) {
    adapter.invalidateModeCache?.();
    if (previousMode !== newMode) {
      console.log(`[sumup] mode changed via admin: ${previousMode} → ${newMode}`);
    }
  }
  if (flags.returnUrlBase) adapter.invalidateReturnUrlCache?.();

  res.json({
    success: true,
    message: 'Configuración SumUp actualizada correctamente',
    updated: flags,
  });
});

router.delete('/admin/settings/sumup', async (req, res) => {
  await query(
    'DELETE FROM settings WHERE key IN ($1, $2, $3, $4, $5)',
    [
      SUMUP_KEYS.apiKey.key,
      SUMUP_KEYS.merchantCode.key,
      SUMUP_KEYS.appId.key,
      SUMUP_KEYS.mode.key,
      SUMUP_KEYS.returnUrlBase.key,
    ],
  );
  const adapter = getSumupAdapter();
  adapter.invalidateModeCache?.();
  adapter.invalidateReturnUrlCache?.();
  res.json({ success: true, message: 'Configuración SumUp eliminada' });
});

// --- SMTP Configuration (Ciclo 176 — migración env → settings) ---
//
// Mueve la configuración SMTP desde .env (C173) a la tabla settings con
// cifrado AES-256-GCM para smtp_pass. Las env vars siguen funcionando como
// fallback de bootstrap; un POST aquí sobreescribe la fuente preferida.

const mailer = require('../utils/mailer');

const SMTP_KEYS = {
  host:     { key: 'smtp_host',     encrypted: false },
  port:     { key: 'smtp_port',     encrypted: false },
  secure:   { key: 'smtp_secure',   encrypted: false },
  user:     { key: 'smtp_user',     encrypted: false },
  pass:     { key: 'smtp_pass',     encrypted: true  },
  from:     { key: 'smtp_from',     encrypted: false },
  replyTo:  { key: 'smtp_reply_to', encrypted: false },
  enabled:  { key: 'smtp_enabled',  encrypted: false },
};

const SMTP_ENABLED_MODES = ['true', 'false', 'auto'];

async function readSmtpSetting({ key, encrypted }) {
  const { rows } = await query('SELECT value, updated_at FROM settings WHERE key = $1', [key]);
  if (rows.length === 0) return { value: null, updatedAt: null };
  const raw = rows[0].value;
  const value = raw ? (encrypted ? decrypt(raw) : raw) : null;
  return { value, updatedAt: rows[0].updated_at };
}

async function writeSmtpSetting({ key, encrypted }, value) {
  const stored = encrypted ? encrypt(value) : value;
  await query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()
  `, [key, stored]);
}

function maskSmtpPass(value) {
  if (!value) return null;
  if (value.length <= 4) return '***';
  return value.slice(0, 2) + '...' + value.slice(-2);
}

router.get('/admin/settings/smtp', async (req, res) => {
  const [host, port, secure, user, pass, from, replyTo, enabled, runtime] = await Promise.all([
    readSmtpSetting(SMTP_KEYS.host),
    readSmtpSetting(SMTP_KEYS.port),
    readSmtpSetting(SMTP_KEYS.secure),
    readSmtpSetting(SMTP_KEYS.user),
    readSmtpSetting(SMTP_KEYS.pass),
    readSmtpSetting(SMTP_KEYS.from),
    readSmtpSetting(SMTP_KEYS.replyTo),
    readSmtpSetting(SMTP_KEYS.enabled),
    mailer.describe(),
  ]);

  res.json({
    provider: 'SMTP',
    runtime,
    host:    { value: host.value || null, updatedAt: host.updatedAt },
    port:    { value: port.value || null, updatedAt: port.updatedAt },
    secure:  { value: secure.value || null, updatedAt: secure.updatedAt },
    user:    { value: user.value || null, updatedAt: user.updatedAt },
    pass:    { configured: !!pass.value, masked: maskSmtpPass(pass.value), updatedAt: pass.updatedAt },
    from:    { value: from.value || null, updatedAt: from.updatedAt },
    replyTo: { value: replyTo.value || null, updatedAt: replyTo.updatedAt },
    enabled: { value: enabled.value || 'auto', updatedAt: enabled.updatedAt },
  });
});

router.post('/admin/settings/smtp', async (req, res) => {
  const { host, port, secure, user, pass, from, reply_to, enabled } = req.body || {};

  const updates = [];
  const flags = { host: false, port: false, secure: false, user: false, pass: false, from: false, replyTo: false, enabled: false };

  if (host !== undefined) {
    if (typeof host !== 'string' || host.trim().length < 3) {
      return res.status(400).json({ error: 'host inválido (mínimo 3 caracteres)' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.host, host.trim()));
    flags.host = true;
  }
  if (port !== undefined) {
    const portNum = Number.parseInt(port, 10);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ error: 'port inválido (entero entre 1 y 65535)' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.port, String(portNum)));
    flags.port = true;
  }
  if (secure !== undefined) {
    const secureStr = String(secure).trim().toLowerCase();
    if (!['true', 'false'].includes(secureStr)) {
      return res.status(400).json({ error: 'secure inválido (true|false)' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.secure, secureStr));
    flags.secure = true;
  }
  if (user !== undefined) {
    if (typeof user !== 'string') {
      return res.status(400).json({ error: 'user inválido' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.user, user.trim()));
    flags.user = true;
  }
  if (pass !== undefined) {
    if (typeof pass !== 'string' || pass.length < 1) {
      return res.status(400).json({ error: 'pass inválido' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.pass, pass));
    flags.pass = true;
  }
  if (from !== undefined) {
    if (typeof from !== 'string' || from.trim().length < 3) {
      return res.status(400).json({ error: 'from inválido' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.from, from.trim()));
    flags.from = true;
  }
  if (reply_to !== undefined) {
    if (typeof reply_to !== 'string') {
      return res.status(400).json({ error: 'reply_to inválido' });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.replyTo, reply_to.trim()));
    flags.replyTo = true;
  }
  if (enabled !== undefined) {
    const enabledStr = String(enabled).trim().toLowerCase();
    if (!SMTP_ENABLED_MODES.includes(enabledStr)) {
      return res.status(400).json({ error: `enabled inválido (valores permitidos: ${SMTP_ENABLED_MODES.join(', ')})` });
    }
    updates.push(writeSmtpSetting(SMTP_KEYS.enabled, enabledStr));
    flags.enabled = true;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  await Promise.all(updates);
  mailer.invalidateCache();

  res.json({
    success: true,
    message: 'Configuración SMTP guardada correctamente',
    updated: flags,
  });
});

router.delete('/admin/settings/smtp', async (req, res) => {
  await query(
    'DELETE FROM settings WHERE key IN ($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      SMTP_KEYS.host.key,
      SMTP_KEYS.port.key,
      SMTP_KEYS.secure.key,
      SMTP_KEYS.user.key,
      SMTP_KEYS.pass.key,
      SMTP_KEYS.from.key,
      SMTP_KEYS.replyTo.key,
      SMTP_KEYS.enabled.key,
    ],
  );
  mailer.invalidateCache();
  res.json({ success: true, message: 'Configuración SMTP eliminada' });
});

// C189: layered SMTP diagnostic — checks decrypt, transport init y verify()
// sin enviar correo. Permite al admin distinguir entre "ENCRYPTION_SECRET
// rotado" (re-grabar contraseña) vs "host/puerto bloqueado" (configurar red).
router.post('/admin/settings/smtp/verify', async (req, res) => {
  const result = await mailer.verifyConnection();
  if (result.verified) {
    return res.json({ success: true, ...result });
  }
  return res.status(502).json({ success: false, ...result });
});

router.post('/admin/settings/smtp/test', async (req, res) => {
  const { to } = req.body || {};
  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
    return res.status(400).json({ error: 'Email destino inválido' });
  }

  const result = await mailer.sendTestMail(to.trim());

  if (result.ok) {
    return res.json({ success: true, message: `Email de prueba enviado a ${to}`, messageId: result.messageId });
  }
  if (result.skipped) {
    // C189: surface decrypt_failed explícito para que la UI pida al admin
    // re-grabar la contraseña en lugar de mostrar "SMTP deshabilitado".
    const errorMsg = result.reason === 'decrypt_failed'
      ? 'No se puede descifrar la contraseña SMTP con el ENCRYPTION_SECRET actual. Vuelve a grabar la contraseña.'
      : 'SMTP deshabilitado o sin configuración mínima';
    return res.status(400).json({ success: false, error: errorMsg, reason: result.reason });
  }
  return res.status(502).json({
    success: false,
    error: result.error || 'Fallo al enviar el email de prueba',
    reason: result.reason || 'unknown',
  });
});

// --- Email Provider / Resend (Ciclo 200 — OPTION B) ---
//
// Permite elegir entre SMTP (nodemailer) y Resend (HTTPS API). Configurar
// Resend evita el bloqueo de TCP egress en puertos SMTP (issue C199 Railway).
// La key se cifra con AES-256-GCM (igual que smtp_pass / sumup_api_key).

const VALID_MAIL_PROVIDERS = ['smtp', 'resend', 'auto'];

router.get('/admin/settings/email', async (req, res) => {
  const [providerRow, resendKeyRow, mailFromRow, mailReplyRow, runtime] = await Promise.all([
    query('SELECT value, updated_at FROM settings WHERE key = $1', ['mail_provider']),
    query('SELECT value, updated_at FROM settings WHERE key = $1', ['resend_api_key']),
    query('SELECT value, updated_at FROM settings WHERE key = $1', ['mail_from']),
    query('SELECT value, updated_at FROM settings WHERE key = $1', ['mail_reply_to']),
    mailer.describe(),
  ]);

  const provider = providerRow.rows[0]?.value || 'auto';
  const resendKeyRaw = resendKeyRow.rows[0]?.value || null;
  const resendKey = resendKeyRaw ? decrypt(resendKeyRaw) : null;
  const resendMasked = resendKey
    ? resendKey.slice(0, 6) + '…' + resendKey.slice(-4)
    : null;

  res.json({
    provider: { value: provider, updatedAt: providerRow.rows[0]?.updated_at || null },
    resend: {
      configured: !!resendKey,
      masked: resendMasked,
      updatedAt: resendKeyRow.rows[0]?.updated_at || null,
    },
    mailFrom: { value: mailFromRow.rows[0]?.value || null, updatedAt: mailFromRow.rows[0]?.updated_at || null },
    mailReplyTo: { value: mailReplyRow.rows[0]?.value || null, updatedAt: mailReplyRow.rows[0]?.updated_at || null },
    runtime,
    validProviders: VALID_MAIL_PROVIDERS,
  });
});

router.post('/admin/settings/email', async (req, res) => {
  const { provider, resend_api_key, mail_from, mail_reply_to } = req.body || {};

  const updates = [];
  const flags = { provider: false, resendApiKey: false, mailFrom: false, mailReplyTo: false };

  if (provider !== undefined) {
    const p = String(provider || '').trim().toLowerCase();
    if (!VALID_MAIL_PROVIDERS.includes(p)) {
      return res.status(400).json({ error: `provider inválido (valores: ${VALID_MAIL_PROVIDERS.join(', ')})` });
    }
    updates.push(query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('mail_provider', $1, NOW())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()`,
      [p],
    ));
    flags.provider = true;
  }
  if (resend_api_key !== undefined) {
    if (typeof resend_api_key !== 'string' || resend_api_key.trim().length < 8) {
      return res.status(400).json({ error: 'resend_api_key inválida (mínimo 8 caracteres)' });
    }
    updates.push(query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('resend_api_key', $1, NOW())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()`,
      [encrypt(resend_api_key.trim())],
    ));
    flags.resendApiKey = true;
  }
  if (mail_from !== undefined) {
    if (typeof mail_from !== 'string' || mail_from.trim().length < 3) {
      return res.status(400).json({ error: 'mail_from inválido' });
    }
    updates.push(query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('mail_from', $1, NOW())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()`,
      [mail_from.trim()],
    ));
    flags.mailFrom = true;
  }
  if (mail_reply_to !== undefined) {
    if (typeof mail_reply_to !== 'string') {
      return res.status(400).json({ error: 'mail_reply_to inválido' });
    }
    updates.push(query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('mail_reply_to', $1, NOW())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()`,
      [mail_reply_to.trim()],
    ));
    flags.mailReplyTo = true;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  await Promise.all(updates);
  mailer.invalidateCache();

  res.json({
    success: true,
    message: 'Configuración de email guardada correctamente',
    updated: flags,
  });
});

router.delete('/admin/settings/email/resend-key', async (req, res) => {
  await query("DELETE FROM settings WHERE key = 'resend_api_key'");
  mailer.invalidateCache();
  res.json({ success: true, message: 'Resend API key eliminada' });
});

router.post('/admin/settings/email/verify', async (req, res) => {
  const result = await mailer.verifyConnection();
  if (result.verified) return res.json({ success: true, ...result });
  return res.status(502).json({ success: false, ...result });
});

router.post('/admin/settings/email/test', async (req, res) => {
  const { to } = req.body || {};
  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
    return res.status(400).json({ error: 'Email destino inválido' });
  }
  const result = await mailer.sendTestMail(to.trim());
  if (result.ok) return res.json({ success: true, message: `Email enviado a ${to}`, provider: result.provider, messageId: result.messageId });
  if (result.skipped) {
    return res.status(400).json({ success: false, error: 'Mailer deshabilitado o sin configuración mínima', reason: result.reason, provider: result.provider });
  }
  return res.status(502).json({ success: false, error: result.error || 'Fallo al enviar', reason: result.reason || 'unknown', provider: result.provider });
});

// --- Bank Account Settings (Ciclo 180 — datos para transferencia) ---
//
// Persiste 6 claves planas en `settings` (sin cifrado: aparecen en el email
// al cliente). El RUT se valida con dígito verificador módulo 11. El tipo
// de cuenta y banco están restringidos a whitelists para evitar typos que
// confundan al cliente.

router.get('/admin/settings/bank', async (req, res) => {
  const bank = await readBankSettings();
  res.json({
    provider: 'BankTransfer',
    configured: isBankConfigured(bank),
    holderRut:     { value: bank.holderRut,     formatted: bank.holderRut ? formatRut(bank.holderRut) : null },
    holderName:    { value: bank.holderName },
    accountType:   { value: bank.accountTypeKey, label: bank.accountTypeLabel },
    accountNumber: { value: bank.accountNumber },
    bank:          { value: bank.bankKey, label: bank.bankLabel },
    holderEmail:   { value: bank.holderEmail },
    catalog: {
      accountTypes: ACCOUNT_TYPES,
      banks:        BANK_NAMES,
    },
    updatedAt: bank.updatedAt,
  });
});

router.post('/admin/settings/bank', async (req, res) => {
  const { holder_rut, holder_name, account_type, account_number, bank, holder_email } = req.body || {};

  const updates = [];
  const flags = { holderRut: false, holderName: false, accountType: false, accountNumber: false, bank: false, holderEmail: false };

  if (holder_rut !== undefined) {
    const raw = String(holder_rut || '').trim();
    if (raw && !validateRut(raw)) {
      return res.status(400).json({ error: 'RUT inválido (dígito verificador no coincide)' });
    }
    const normalized = raw ? formatRut(raw) : '';
    updates.push(writeBankKey(BANK_KEYS.holderRut, normalized));
    flags.holderRut = true;
  }
  if (holder_name !== undefined) {
    if (typeof holder_name !== 'string') {
      return res.status(400).json({ error: 'holder_name inválido' });
    }
    updates.push(writeBankKey(BANK_KEYS.holderName, holder_name.trim()));
    flags.holderName = true;
  }
  if (account_type !== undefined) {
    const key = String(account_type || '').trim().toLowerCase();
    if (key && !Object.prototype.hasOwnProperty.call(ACCOUNT_TYPES, key)) {
      return res.status(400).json({ error: `account_type inválido (valores: ${Object.keys(ACCOUNT_TYPES).join(', ')})` });
    }
    updates.push(writeBankKey(BANK_KEYS.accountType, key));
    flags.accountType = true;
  }
  if (account_number !== undefined) {
    const num = String(account_number || '').trim();
    if (num && !/^[0-9-]{3,30}$/.test(num)) {
      return res.status(400).json({ error: 'account_number inválido (solo dígitos y guiones, 3-30 caracteres)' });
    }
    updates.push(writeBankKey(BANK_KEYS.accountNumber, num));
    flags.accountNumber = true;
  }
  if (bank !== undefined) {
    const key = String(bank || '').trim().toLowerCase();
    if (key && !Object.prototype.hasOwnProperty.call(BANK_NAMES, key)) {
      return res.status(400).json({ error: `bank inválido (valores: ${Object.keys(BANK_NAMES).join(', ')})` });
    }
    updates.push(writeBankKey(BANK_KEYS.bankName, key));
    flags.bank = true;
  }
  if (holder_email !== undefined) {
    const email = String(holder_email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'holder_email inválido' });
    }
    updates.push(writeBankKey(BANK_KEYS.holderEmail, email));
    flags.holderEmail = true;
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  await Promise.all(updates);
  res.json({
    success: true,
    message: 'Datos bancarios guardados correctamente',
    updated: flags,
  });
});

router.delete('/admin/settings/bank', async (req, res) => {
  await query(
    'DELETE FROM settings WHERE key IN ($1,$2,$3,$4,$5,$6)',
    [
      BANK_KEYS.holderRut,
      BANK_KEYS.holderName,
      BANK_KEYS.accountType,
      BANK_KEYS.accountNumber,
      BANK_KEYS.bankName,
      BANK_KEYS.holderEmail,
    ],
  );
  res.json({ success: true, message: 'Datos bancarios eliminados' });
});

// POST /admin/settings/bank/test-email
// Envía un email mock de orden con payment_method='transferencia' al
// destinatario indicado para validar que el bloque bancario renderiza
// correctamente sin tener que generar un pedido real.
router.post('/admin/settings/bank/test-email', async (req, res) => {
  const { to } = req.body || {};
  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
    return res.status(400).json({ error: 'Email destino inválido' });
  }

  const bank = await readBankSettings();
  if (!isBankConfigured(bank)) {
    return res.status(400).json({
      error: 'Datos bancarios incompletos — completa todos los campos requeridos antes de enviar la prueba.',
    });
  }

  const mockOrder = {
    order_id: `TEST-${Date.now()}`,
    contact: { name: 'Cliente de Prueba', email: to.trim(), phone: '+56 9 0000 0000' },
    address: { street: 'Av. Test', number: '123', commune: 'Providencia', city: 'Santiago', notes: 'Pedido de prueba — no preparar' },
    payment_method: 'transferencia',
    customer_instructions: 'Email de prueba — bloque bancario',
    items: [
      { name: 'Latte 12oz', price: 3500, quantity: 1, subtotal: 3500 },
      { name: 'Croissant', price: 2500, quantity: 1, subtotal: 2500 },
    ],
    subtotal: 6000,
    total: 6000,
    bankAccount: bank,
    logoUrl: await resolveLogoUrl(),
  };

  try {
    const payload = buildOrderConfirmationEmail(mockOrder);
    const result = await mailer.sendMail(payload);
    if (result?.ok) {
      return res.json({ success: true, message: `Email de prueba con datos bancarios enviado a ${to}`, messageId: result.messageId });
    }
    if (result?.skipped) {
      return res.status(400).json({ success: false, error: 'SMTP deshabilitado o sin configuración mínima', reason: result.reason });
    }
    return res.status(502).json({ success: false, error: result?.error || 'Fallo al enviar el email de prueba' });
  } catch (err) {
    console.error('[bank] test-email failed:', err.message);
    return res.status(500).json({ success: false, error: 'Error interno al construir el email de prueba' });
  }
});

module.exports = router;
