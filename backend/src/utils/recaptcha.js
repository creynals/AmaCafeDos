const { query } = require('../models/database');
const { decrypt } = require('./crypto');

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const SCORE_THRESHOLD = 0.5;

/**
 * Obtiene la configuración de reCAPTCHA desde la base de datos.
 */
async function getRecaptchaConfig() {
  const { rows: siteKeyRows } = await query('SELECT value FROM settings WHERE key = $1', ['recaptcha_site_key']);
  const { rows: secretKeyRows } = await query('SELECT value FROM settings WHERE key = $1', ['recaptcha_secret_key']);
  const { rows: enabledRows } = await query('SELECT value FROM settings WHERE key = $1', ['recaptcha_enabled']);

  return {
    siteKey: siteKeyRows[0] ? siteKeyRows[0].value : null,
    secretKey: secretKeyRows[0] ? decrypt(secretKeyRows[0].value) : null,
    enabled: enabledRows[0] ? enabledRows[0].value === 'true' : false,
  };
}

/**
 * Guarda la configuración de reCAPTCHA en la base de datos.
 */
async function saveRecaptchaConfig(siteKey, secretKey, enabled) {
  const { encrypt } = require('./crypto');

  const upsertSql = `
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()
  `;

  if (siteKey !== undefined) await query(upsertSql, ['recaptcha_site_key', siteKey]);
  if (secretKey !== undefined) await query(upsertSql, ['recaptcha_secret_key', encrypt(secretKey)]);
  if (enabled !== undefined) await query(upsertSql, ['recaptcha_enabled', String(enabled)]);
}

/**
 * Verifica un token de reCAPTCHA v3 con Google.
 * Retorna { success, score, action } o lanza error.
 */
async function verifyRecaptchaToken(token) {
  const config = await getRecaptchaConfig();

  if (!config.enabled) {
    return { success: true, score: 1.0, action: 'bypass', bypassed: true };
  }

  if (!config.secretKey) {
    console.warn('reCAPTCHA enabled but secret key not configured — bypassing');
    return { success: true, score: 1.0, action: 'bypass', bypassed: true };
  }

  if (!token) {
    return { success: false, score: 0, action: 'missing_token' };
  }

  const params = new URLSearchParams({
    secret: config.secretKey,
    response: token,
  });

  const response = await fetch(RECAPTCHA_VERIFY_URL, {
    method: 'POST',
    body: params,
  });

  if (!response.ok) {
    console.error('reCAPTCHA verify API error:', response.status);
    return { success: false, score: 0, action: 'api_error' };
  }

  const data = await response.json();

  if (!data.success) {
    console.warn('reCAPTCHA verification failed:', data['error-codes']);
    return { success: false, score: 0, action: data.action || 'unknown' };
  }

  // Verificar que el action coincida con el esperado
  if (data.action && data.action !== 'chat') {
    console.warn(`reCAPTCHA action mismatch: expected 'chat', got '${data.action}'`);
    return { success: false, score: data.score || 0, action: data.action };
  }

  return {
    success: data.score >= SCORE_THRESHOLD,
    score: data.score || 0,
    action: data.action || 'unknown',
  };
}

/**
 * Middleware Express para verificar reCAPTCHA en rutas protegidas.
 */
async function recaptchaMiddleware(req, res, next) {
  try {
    const result = await verifyRecaptchaToken(req.body?.recaptcha_token);

    if (!result.success) {
      console.warn(`reCAPTCHA failed: score=${result.score}, action=${result.action}`);
      return res.status(403).json({
        error: 'Verificación de seguridad fallida',
        reply: 'No pudimos verificar que eres humano. Recarga la página e intenta de nuevo. 🔒',
      });
    }

    req.recaptchaScore = result.score;
    next();
  } catch (err) {
    console.error('reCAPTCHA middleware error:', err.message);
    return res.status(500).json({
      error: 'Error en verificación de seguridad',
      reply: 'Hubo un problema con la verificación de seguridad. Recarga la página e intenta de nuevo. 🔒',
    });
  }
}

module.exports = { verifyRecaptchaToken, recaptchaMiddleware, getRecaptchaConfig, saveRecaptchaConfig };
