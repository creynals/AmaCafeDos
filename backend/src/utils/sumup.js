/**
 * SumUp payment integration — SDK-style native client (Card widget v2, CLP).
 *
 * Ciclo 31 (Option C — Modernización SumUp-Native, gate consolidado):
 *   - DG #1: refactor SDK-style sin agregar @sumup/sdk como dependencia
 *     (cliente fetch nativo con clase de error tipada y namespace por
 *     recurso). Adopción del SDK queda como Phase 2 opcional (LOW prio).
 *   - DG #2: el adapter sigue exponiendo createCheckout/getCheckout para el
 *     Card Widget v2 embebido — el widget habla directo con SumUp desde el
 *     navegador y el webhook es la fuente autoritativa. completeCheckout se
 *     conserva para el flujo headless (POS / server-driven), no se invoca
 *     desde la ruta de pago del cliente.
 *   - DG #3: extractCardScheme(rawCheckout) extrae transactions[0].card.type
 *     para poblar orders.card_scheme (migración 007).
 *
 * Credenciales (Ciclo 15 — L2 coherence):
 *   sumup_api_key/sumup_merchant_code   → settings (AES-256-GCM)
 *   sumup_app_id                        → settings (plano)
 *   sumup_mode/sumup_return_url_base    → settings (plano, dispatcher runtime)
 *
 * Ciclo 26 (Option A): no hay verificación HMAC del webhook (SumUp Dashboard
 * no expone signing secret por endpoint). Seguridad real: getCheckout
 * autoritativo + idempotencia por event_id (capa A + B en webhooks.js).
 */

const { query } = require('../models/database');
const { decrypt } = require('./crypto');
const {
  getMode,
  buildReturnUrls,
  invalidateModeCache,
  invalidateReturnUrlCache,
} = require('./sumup.config');

const SUMUP_API_BASE = 'https://api.sumup.com';
const CURRENCY = 'CLP';

/**
 * Error tipado para fallas en la API de SumUp. Permite a rutas de Express
 * distinguir entre errores de configuración (503) y errores upstream (502).
 */
class SumUpError extends Error {
  constructor(message, { status, code, payload } = {}) {
    super(message);
    this.name = 'SumUpError';
    this.status = status ?? null;
    this.code = code ?? null;
    this.payload = payload ?? null;
  }

  get isConfigError() {
    return this.code === 'config_missing';
  }

  get isUpstreamError() {
    return this.status !== null && this.status >= 400;
  }
}

async function readSetting(key, { encrypted }) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  if (rows.length === 0) return null;
  const raw = rows[0].value;
  if (!raw) return null;
  return encrypted ? decrypt(raw) : raw;
}

/**
 * Carga credenciales SumUp desde settings. Lanza SumUpError(config_missing)
 * si falta cualquier credencial requerida.
 */
async function getConfig() {
  const [apiKey, merchantCode, appId] = await Promise.all([
    readSetting('sumup_api_key',       { encrypted: true }),
    readSetting('sumup_merchant_code', { encrypted: true }),
    readSetting('sumup_app_id',        { encrypted: false }),
  ]);

  if (!apiKey)        throw new SumUpError('SumUp config missing: sumup_api_key',       { code: 'config_missing' });
  if (!merchantCode)  throw new SumUpError('SumUp config missing: sumup_merchant_code', { code: 'config_missing' });
  if (!appId)         throw new SumUpError('SumUp config missing: sumup_app_id',        { code: 'config_missing' });

  const urls = await buildReturnUrls();

  return { apiKey, merchantCode, appId, returnUrls: urls };
}

/**
 * Cliente HTTP minimal estilo SDK. Lanza SumUpError con status/payload en
 * caso de respuesta no-2xx.
 */
async function sumupFetch(path, { method = 'GET', body } = {}) {
  const { apiKey } = await getConfig();
  const res = await fetch(`${SUMUP_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { raw_text: text }; }
  }
  if (!res.ok) {
    throw new SumUpError(
      `SumUp ${method} ${path} failed (${res.status}): ${data.message || data.raw_text || 'unknown'}`,
      { status: res.status, payload: data },
    );
  }
  return data;
}

/**
 * Extrae la marca de tarjeta (VISA, MASTERCARD, AMEX, ...) de la respuesta
 * cruda de un checkout SumUp. Devuelve null si el checkout no tiene
 * transacción exitosa todavía.
 *
 * SumUp puede usar `transactions[0].card.type` o `card.type` directo según
 * versión del payload; cubrimos ambos.
 */
function extractCardScheme(rawCheckout) {
  if (!rawCheckout || typeof rawCheckout !== 'object') return null;
  const fromTransaction = rawCheckout.transactions?.[0]?.card?.type;
  const fromTopLevel    = rawCheckout.card?.type;
  const scheme = fromTransaction || fromTopLevel || null;
  return typeof scheme === 'string' && scheme.trim() ? scheme.trim().toUpperCase() : null;
}

/**
 * Ciclo 82: snapshot de la primera transacción para trazabilidad/soporte.
 * SumUp expone esto en `transactions[0]`; algunos canales legacy ponen
 * `transaction_code`/`timestamp` a nivel raíz, así que cubrimos ambos.
 *
 * Devuelve siempre un objeto con id/code/status/at; cualquiera puede ser null
 * si el checkout aún no tiene transacción autorizada.
 */
function extractTransaction(rawCheckout) {
  if (!rawCheckout || typeof rawCheckout !== 'object') {
    return { id: null, code: null, status: null, at: null };
  }
  const tx = rawCheckout.transactions?.[0] || {};
  const id     = tx.id              || rawCheckout.transaction_id     || null;
  const code   = tx.transaction_code || rawCheckout.transaction_code  || null;
  const status = tx.status          || null;
  const at     = tx.timestamp       || rawCheckout.timestamp          || null;
  return {
    id:     id     || null,
    code:   code   || null,
    status: typeof status === 'string' && status.trim() ? status.trim().toUpperCase() : null,
    at:     at     || null,
  };
}

// ----- Resource: Checkouts -------------------------------------------------

/**
 * Crea un checkout SumUp para una orden. Devuelve los datos que el Card
 * Widget v2 necesita para montarse en el navegador.
 *
 * return_url   = webhook (server-to-server)
 * redirect_url = success UI (browser post-pago)
 */
async function createCheckout({ orderId, amount, description }) {
  const { merchantCode } = await getConfig();
  const urls = await buildReturnUrls();

  const data = await sumupFetch('/v0.1/checkouts', {
    method: 'POST',
    body: {
      checkout_reference: `order-${orderId}`,
      amount,
      currency: CURRENCY,
      merchant_code: merchantCode,
      description: description || `Pedido amaCafe #${orderId}`,
      return_url: urls.webhook,
      redirect_url: urls.success,
    },
  });

  return {
    checkoutId: data.id,
    reference: data.checkout_reference,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    merchantCode,
    returnUrls: urls,
  };
}

/** Estado actual de un checkout (autoritativo desde SumUp). */
async function getCheckout(checkoutId) {
  const data = await sumupFetch(`/v0.1/checkouts/${encodeURIComponent(checkoutId)}`);
  const tx = extractTransaction(data);
  return {
    checkoutId: data.id,
    status: data.status,
    transactionId: tx.id,
    transactionCode: tx.code,
    transactionStatus: tx.status,
    transactionAt: tx.at,
    cardScheme: extractCardScheme(data),
    amount: data.amount,
    currency: data.currency,
    raw: data,
  };
}

/**
 * Completa un checkout headless con el payload de tarjeta. NO se usa desde el
 * flujo Card Widget v2 (el widget habla directo con SumUp); se conserva para
 * integraciones server-driven futuras (POS, recurring, headless API).
 */
async function completeCheckout(checkoutId, cardPayload) {
  const data = await sumupFetch(`/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
    method: 'PUT',
    body: { payment_type: 'card', card: cardPayload },
  });

  const tx = extractTransaction(data);
  return {
    checkoutId: data.id,
    status: data.status,
    transactionId: tx.id,
    transactionCode: tx.code,
    transactionStatus: tx.status,
    transactionAt: tx.at,
    cardScheme: extractCardScheme(data),
    amount: data.amount,
    currency: data.currency,
    raw: data,
  };
}

/** Normaliza un status SumUp al enum interno payment_status. */
function mapStatus(sumupStatus) {
  switch ((sumupStatus || '').toUpperCase()) {
    case 'PAID':
    case 'SUCCESSFUL':
      return 'paid';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'cancelled';
    case 'PENDING':
      return 'processing';
    default:
      return 'pending';
  }
}

// Ciclo 31: deriva el orders.status (fulfillment) desde el payment_status.
// Regla: cuando el pago entra a estado terminal no-pagado (failed/cancelled/
// refunded), el fulfillment también debe cerrarse en 'cancelled' — una orden
// con pago rechazado no debe seguir apareciendo en Vista de Cocina como
// 'pending'. Devuelve null cuando no hay transición a forzar (orden ya está
// en estado terminal de fulfillment, o el pago no es terminal-rechazado).
const FULFILLMENT_TERMINAL = new Set(['delivered', 'cancelled', 'returned']);
function deriveFulfillmentFromPayment(currentFulfillment, paymentStatus) {
  if (FULFILLMENT_TERMINAL.has(currentFulfillment)) return null;
  if (paymentStatus === 'failed' || paymentStatus === 'cancelled' || paymentStatus === 'refunded') {
    return 'cancelled';
  }
  return null;
}

const realAdapter = {
  currency: CURRENCY,
  getConfig,
  createCheckout,
  getCheckout,
  completeCheckout,
  mapStatus,
  buildReturnUrls,
  extractCardScheme,
  extractTransaction,
};

// Lazy dispatcher: resuelve el adapter activo (real | mock) por llamada
// según sumup_mode. invalidateModeCache() en el route handler hace que el
// cambio de modo aplique en la siguiente llamada.
async function resolveAdapter() {
  const mode = await getMode();
  return mode === 'mock' ? require('./sumup.mocks.js') : realAdapter;
}

module.exports = {
  currency: CURRENCY,
  CURRENCY,

  // Pass-through dispatch al adapter activo
  async getConfig(...args)        { return (await resolveAdapter()).getConfig?.(...args) ?? realAdapter.getConfig(...args); },
  async createCheckout(...args)   { return (await resolveAdapter()).createCheckout(...args); },
  async getCheckout(...args)      { return (await resolveAdapter()).getCheckout(...args); },
  async completeCheckout(...args) { return (await resolveAdapter()).completeCheckout(...args); },
  async buildReturnUrls()         { return (await resolveAdapter()).buildReturnUrls(); },

  // Pure / invalidation — no dispatch
  mapStatus,
  deriveFulfillmentFromPayment,
  extractCardScheme,
  extractTransaction,
  invalidateModeCache,
  invalidateReturnUrlCache,

  // Tipos exportados
  SumUpError,

  // Escape hatches para tests / introspección
  realAdapter,
};
