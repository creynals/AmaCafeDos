const express = require('express');
const { query } = require('../models/database');
const { encrypt, decrypt } = require('../utils/crypto');
const { getModelConfig, saveModelConfig, fetchAvailableModels, DEFAULT_MODEL, FALLBACK_MODEL } = require('../utils/openrouter');
const { getRecaptchaConfig, saveRecaptchaConfig } = require('../utils/recaptcha');
const {
  getModeWithSource: getSumupModeWithSource,
  getReturnUrlBaseWithSource: getSumupReturnUrlBaseWithSource,
} = require('../utils/sumup.config');

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

// Public endpoint: retorna site key para que el frontend cargue reCAPTCHA
router.get('/settings/recaptcha-config', async (req, res) => {
  const config = await getRecaptchaConfig();
  res.json({
    enabled: config.enabled,
    siteKey: config.siteKey || null,
  });
});

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

module.exports = router;
