// Ciclo 31 — Tests del derivador de fulfillment desde payment_status.
// Run: node --test backend/src/utils/sumup.test.js
//
// Solo cubre la función pura deriveFulfillmentFromPayment. El flujo HTTP
// (webhook, /sync-payment, /sumup/result) queda para validación E2E manual.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveFulfillmentFromPayment } = require('./sumup');

test('payment failed → fulfillment cancelled', () => {
  assert.equal(deriveFulfillmentFromPayment('pending', 'failed'), 'cancelled');
  assert.equal(deriveFulfillmentFromPayment('in_progress', 'failed'), 'cancelled');
});

test('payment cancelled → fulfillment cancelled', () => {
  assert.equal(deriveFulfillmentFromPayment('pending', 'cancelled'), 'cancelled');
});

test('payment refunded → fulfillment cancelled', () => {
  assert.equal(deriveFulfillmentFromPayment('out_for_delivery', 'refunded'), 'cancelled');
});

test('payment paid/processing/pending → no derivation', () => {
  assert.equal(deriveFulfillmentFromPayment('pending', 'paid'), null);
  assert.equal(deriveFulfillmentFromPayment('pending', 'processing'), null);
  assert.equal(deriveFulfillmentFromPayment('pending', 'pending'), null);
});

test('terminal fulfillment is preserved (no overwrite)', () => {
  assert.equal(deriveFulfillmentFromPayment('delivered', 'failed'), null);
  assert.equal(deriveFulfillmentFromPayment('cancelled', 'refunded'), null);
  assert.equal(deriveFulfillmentFromPayment('returned', 'failed'), null);
});

test('regression — caso orden #189 (Tarjeta Falló + Pendiente)', () => {
  // Antes del Ciclo 31 una orden con payment_status=failed quedaba en
  // status=pending. La derivación debe forzar cancelled.
  assert.equal(deriveFulfillmentFromPayment('pending', 'failed'), 'cancelled');
});
