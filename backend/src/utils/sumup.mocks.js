/**
 * In-memory SumUp mock. Same interface as sumup.js — used when sumup_mode=mock.
 *
 * Behavior is deterministic-ish to keep local dev predictable:
 *   - createCheckout returns a stable id derived from the orderId
 *   - completeCheckout: amounts ending in "13" simulate FAILED, rest PAID
 *   - getCheckout reads from the in-memory store
 *
 * Ciclo 15: buildReturnUrls ahora es async y delega en sumup.config.js que
 * lee sumup_return_url_base desde `settings` (con env como fallback). Mantiene
 * paridad de comportamiento con el adapter real.
 *
 * Ciclo 26 (Option A): verifyWebhookSignature removed — HMAC verification
 * stripped entirely from both real and mock adapters.
 */

const { buildReturnUrls } = require('./sumup.config');

const CURRENCY = 'CLP';
const store = new Map();

function extractCardScheme(rawCheckout) {
  if (!rawCheckout || typeof rawCheckout !== 'object') return null;
  const fromTransaction = rawCheckout.transactions?.[0]?.card?.type;
  const fromTopLevel    = rawCheckout.card?.type;
  const scheme = fromTransaction || fromTopLevel || null;
  return typeof scheme === 'string' && scheme.trim() ? scheme.trim().toUpperCase() : null;
}

// Ciclo 82: paridad con adapter real — extrae snapshot de transactions[0]
// para los nuevos campos de trazabilidad/soporte.
function extractTransaction(rawCheckout) {
  if (!rawCheckout || typeof rawCheckout !== 'object') {
    return { id: null, code: null, status: null, at: null };
  }
  const tx = rawCheckout.transactions?.[0] || {};
  const id     = tx.id              || rawCheckout.transaction_id    || null;
  const code   = tx.transaction_code || rawCheckout.transaction_code || null;
  const status = tx.status          || null;
  const at     = tx.timestamp       || rawCheckout.timestamp         || null;
  return {
    id:     id     || null,
    code:   code   || null,
    status: typeof status === 'string' && status.trim() ? status.trim().toUpperCase() : null,
    at:     at     || null,
  };
}

async function createCheckout({ orderId, amount, description }) {
  const checkoutId = `mock_chk_${orderId}_${Date.now()}`;
  const urls = await buildReturnUrls();
  const record = {
    id: checkoutId,
    checkout_reference: `order-${orderId}`,
    status: 'PENDING',
    amount,
    currency: CURRENCY,
    description: description || `Pedido amaCafe #${orderId}`,
    transaction_id: null,
    transactions: [],
  };
  store.set(checkoutId, record);
  return {
    checkoutId,
    reference: record.checkout_reference,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    merchantCode: 'MOCK_MERCHANT',
    returnUrls: urls,
  };
}

async function getCheckout(checkoutId) {
  const record = store.get(checkoutId);
  if (!record) {
    const err = new Error(`Mock checkout not found: ${checkoutId}`);
    err.status = 404;
    throw err;
  }
  const tx = extractTransaction(record);
  return {
    checkoutId: record.id,
    status: record.status,
    transactionId: tx.id,
    transactionCode: tx.code,
    transactionStatus: tx.status,
    transactionAt: tx.at,
    cardScheme: extractCardScheme(record),
    amount: record.amount,
    currency: record.currency,
    raw: { ...record },
  };
}

async function completeCheckout(checkoutId, cardPayload) {
  const record = store.get(checkoutId);
  if (!record) {
    const err = new Error(`Mock checkout not found: ${checkoutId}`);
    err.status = 404;
    throw err;
  }

  const amountStr = String(record.amount);
  const fails = amountStr.endsWith('13') || cardPayload?.number === '4000000000000002';

  // Mock card scheme extraction: derive from card number prefix or default VISA
  let mockScheme = 'VISA';
  const num = String(cardPayload?.number || '');
  if (num.startsWith('5')) mockScheme = 'MASTERCARD';
  else if (num.startsWith('3')) mockScheme = 'AMEX';

  // Ciclo 82: poblamos transaction_code/status/timestamp en el mock para
  // que las pruebas locales ejerciten el flujo completo (webhook + sync).
  const nowIso = new Date().toISOString();
  record.status = fails ? 'FAILED' : 'PAID';
  record.transaction_id = fails ? null : `mock_txn_${checkoutId}`;
  record.transactions = fails ? [] : [{
    id: record.transaction_id,
    transaction_code: `MOCKTC${checkoutId.slice(-6).toUpperCase()}`,
    status: 'SUCCESSFUL',
    timestamp: nowIso,
    card: { type: mockScheme, last_4_digits: num.slice(-4) || '4242' },
  }];
  store.set(checkoutId, record);

  const tx = extractTransaction(record);
  return {
    checkoutId: record.id,
    status: record.status,
    transactionId: tx.id,
    transactionCode: tx.code,
    transactionStatus: tx.status,
    transactionAt: tx.at,
    cardScheme: extractCardScheme(record),
    amount: record.amount,
    currency: record.currency,
    raw: { ...record },
  };
}

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

function __reset() {
  store.clear();
}

module.exports = {
  currency: CURRENCY,
  createCheckout,
  getCheckout,
  completeCheckout,
  mapStatus,
  extractCardScheme,
  extractTransaction,
  buildReturnUrls,
  __reset,
  __store: store,
};
