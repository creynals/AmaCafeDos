/**
 * Shared non-secret config helpers for SumUp (mode + return URL base).
 *
 * Ciclo 15: `sumup_mode` y `sumup_return_url_base` viven en `settings` (plano)
 * como el resto de la configuración SumUp. El env var se mantiene únicamente
 * como fallback de bootstrap para instalaciones donde la BD aún no tiene la
 * fila (p. ej. primer arranque pre-migration 004).
 *
 * Ambos helpers usan un caché in-proc con TTL 5min — mismo patrón que
 * getWebhookSecret. Rotación vía UI es efectiva a los ≤ 5 min, o inmediata
 * si el route handler invoca invalidateModeCache / invalidateReturnUrlCache
 * tras el POST (ver backend/src/routes/settings.js).
 *
 * Se aísla en un módulo separado (no en sumup.js) para poder ser consumido
 * tanto por sumup.js (adapter real + dispatcher) como por sumup.mocks.js
 * sin crear dependencia circular.
 *
 * Ciclo 41 (Option B — Hardening Coherente con Failsafes):
 *   - Default fallback alineado a 'mock' (coherente con migration 004 y
 *     .env.example) para no promover silenciosamente a 'live' si la BD está
 *     vacía y el env var no está seteado.
 *   - readPlainSetting distingue "row ausente" (retorna null) de "DB error"
 *     (loguea warn y retorna null) — antes `.catch(() => null)` los mezclaba.
 *   - getModeWithSource() expone el origen del valor (settings|env|default)
 *     para diagnóstico, startup log y GET /admin/settings/sumup.
 */

const { query } = require('../models/database');

const CONFIG_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MODE = 'mock';
const VALID_MODES = ['mock', 'live'];

let modeCache = { value: null, source: null, expiresAt: 0 };
let returnUrlCache = { value: null, source: null, expiresAt: 0 };

async function readPlainSetting(key) {
  try {
    const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length === 0) return null;
    const raw = rows[0].value;
    return raw ? raw : null;
  } catch (err) {
    console.warn(`[sumup.config] DB error reading setting '${key}': ${err.message} — falling back to env/default`);
    return null;
  }
}

async function getModeWithSource() {
  const now = Date.now();
  if (modeCache.value && modeCache.expiresAt > now) {
    return { value: modeCache.value, source: modeCache.source };
  }

  const fromSetting = await readPlainSetting('sumup_mode');
  let value;
  let source;

  if (fromSetting) {
    value = fromSetting;
    source = 'settings';
  } else if (process.env.SUMUP_MODE) {
    value = process.env.SUMUP_MODE;
    source = 'env';
  } else {
    value = DEFAULT_MODE;
    source = 'default';
  }

  if (!VALID_MODES.includes(value)) {
    console.warn(`[sumup.config] invalid sumup_mode='${value}' from ${source} — coercing to '${DEFAULT_MODE}'`);
    value = DEFAULT_MODE;
    source = 'default';
  }

  modeCache = { value, source, expiresAt: now + CONFIG_TTL_MS };
  return { value, source };
}

async function getMode() {
  return (await getModeWithSource()).value;
}

async function getReturnUrlBaseWithSource() {
  const now = Date.now();
  if (returnUrlCache.value && returnUrlCache.expiresAt > now) {
    return { value: returnUrlCache.value, source: returnUrlCache.source };
  }

  const fromSetting = await readPlainSetting('sumup_return_url_base');
  let value;
  let source;

  if (fromSetting) {
    value = fromSetting;
    source = 'settings';
  } else if (process.env.SUMUP_RETURN_URL_BASE) {
    value = process.env.SUMUP_RETURN_URL_BASE;
    source = 'env';
  } else {
    return { value: null, source: 'unset' };
  }

  returnUrlCache = { value, source, expiresAt: now + CONFIG_TTL_MS };
  return { value, source };
}

async function getReturnUrlBase() {
  const { value } = await getReturnUrlBaseWithSource();
  if (!value) {
    throw new Error('SumUp config missing: sumup_return_url_base (set via POST /admin/settings/sumup)');
  }
  return value;
}

function invalidateModeCache() {
  modeCache = { value: null, source: null, expiresAt: 0 };
}

function invalidateReturnUrlCache() {
  returnUrlCache = { value: null, source: null, expiresAt: 0 };
}

/**
 * Build URLs for SumUp checkout.
 *
 * Ciclo 18 (fix brecha P0 #4): SumUp envía el webhook
 * CHECKOUT_STATUS_CHANGED a `return_url`, NO a una URL registrada en panel
 * aparte. Antes apuntábamos `return_url` a `/checkout/success` (UI del
 * frontend), por lo que la notificación POST de SumUp golpeaba una SPA que
 * respondía 200 OK pero nunca procesaba el evento. Ahora:
 *
 *   - webhook:  `${base}/webhook/sumup`  (backend POST — getCheckout + idempotencia)
 *   - success:  `${base}/checkout/success` (frontend redirect tras pagar)
 *   - failure:  `${base}/checkout/failure` (frontend redirect tras fallo)
 *
 * El checkout de SumUp usa `return_url = webhook` y `redirect_url = success`:
 *   - return_url:   POST server-to-server con el evento
 *   - redirect_url: browser redirect tras finalizar (UX)
 *
 * Ciclo 25/26: la verificación HMAC fue removida; la "verificación" del
 * webhook se delega a `getCheckout` (estado autoritativo desde SumUp) +
 * dedup por `event_id = sha256(rawBody)` en payment_events.
 */
async function buildReturnUrls() {
  const base = (await getReturnUrlBase()).replace(/\/$/, '');
  return {
    webhook: `${base}/webhook/sumup`,
    success: `${base}/checkout/success`,
    failure: `${base}/checkout/failure`,
  };
}

module.exports = {
  getMode,
  getModeWithSource,
  getReturnUrlBase,
  getReturnUrlBaseWithSource,
  buildReturnUrls,
  invalidateModeCache,
  invalidateReturnUrlCache,
  DEFAULT_MODE,
  VALID_MODES,
};
