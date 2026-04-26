/**
 * SumUp result page endpoint — GET /api/payments/sumup/result?checkout_id=...
 *
 * Ciclo 86 (Option C MVP — diseño C84/C85):
 *   Endpoint público, identificado por checkout_id (capability temporal,
 *   sin PII), pensado para que la página /checkout/success consulte el
 *   resultado real cuando SumUp redirija al usuario.
 *
 *   Coordinación con el resto del sistema:
 *     - El webhook (webhooks.js) y el sync activo del modal
 *       (orders.js → /sync-payment) son las dos fuentes que actualizan
 *       payment_status. Este endpoint NO duplica esa lógica: si la orden
 *       todavía está en pending/processing, hace un sync activo aquí mismo
 *       para que el redirect siempre vea el estado más fresco.
 *     - Si payment_status ya es terminal (paid/failed/cancelled), devuelve
 *       el snapshot de DB sin volver a llamar a SumUp.
 *
 *   DTO devuelto pensado para frontend MVP — solo lo necesario para mostrar
 *   OK / NOK / pending. Sin PII (no contact, no address, no items).
 */

const express = require('express');
const { query } = require('../models/database');
const sumup = require('../utils/sumup');

const router = express.Router();

const TERMINAL_STATUSES = new Set(['paid', 'failed', 'cancelled']);

const MESSAGES = {
  paid:       'Pago aprobado',
  failed:     'Pago rechazado',
  cancelled:  'Pago cancelado',
  processing: 'Pago en validación',
  pending:    'Pago en validación',
};

function buildDto(order, sumupStatusUpper) {
  return {
    checkout_id:              order.sumup_checkout_id,
    order_id:                 order.id,
    payment_status:           order.payment_status,
    sumup_status:             sumupStatusUpper || null,
    transaction_id:           order.sumup_transaction_id   || null,
    transaction_code:         order.sumup_transaction_code || null,
    sumup_transaction_status: order.sumup_transaction_status || null,
    sumup_transaction_at:     order.sumup_transaction_at     || null,
    card_scheme:              order.card_scheme || null,
    amount:                   order.total,
    currency:                 order.payment_currency || sumup.CURRENCY,
    message:                  MESSAGES[order.payment_status] || 'Estado de pago desconocido',
  };
}

router.get('/payments/sumup/result', async (req, res) => {
  const checkoutId = (req.query.checkout_id || '').toString().trim();

  if (!checkoutId) {
    return res.status(400).json({ error: 'checkout_id_required' });
  }

  const { rows: orderRows } = await query(
    'SELECT * FROM orders WHERE sumup_checkout_id = $1 LIMIT 1',
    [checkoutId],
  );
  let order = orderRows[0];

  if (!order) {
    return res.status(404).json({ error: 'order_not_found', checkout_id: checkoutId });
  }

  // Si el estado ya es terminal, no hace falta volver a SumUp.
  if (TERMINAL_STATUSES.has(order.payment_status)) {
    return res.json(buildDto(order, (order.sumup_transaction_status || '').toUpperCase() || null));
  }

  // Sync activo: el redirect llega antes que el webhook en sandbox y el modal
  // puede no haberse cerrado todavía con sync. Reusamos la misma lógica
  // autoritativa (getCheckout + COALESCE) que /orders/:id/sync-payment.
  let checkout;
  try {
    checkout = await sumup.getCheckout(checkoutId);
  } catch (err) {
    console.error(
      `[payments/sumup/result] getCheckout failed for checkout=${checkoutId}: ${err.message}`,
    );
    // Devolvemos el snapshot DB con 200 para que el frontend siga haciendo
    // polling — un fallo upstream transitorio no debe romper la UI.
    return res.json(buildDto(order, null));
  }

  const internalStatus = sumup.mapStatus(checkout.status);
  const now = new Date();
  const eventId = `result:${checkoutId}:${(checkout.status || 'unknown').toUpperCase()}`;

  // Audit row (idempotente por UNIQUE parcial sobre event_id).
  await query(
    `INSERT INTO payment_events
       (order_id, provider, event_type, checkout_id, transaction_id,
        event_id, status, amount, currency, raw_payload, processed_at)
     VALUES ($1, 'sumup', 'CHECKOUT_RESULT_QUERY', $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
    [
      order.id,
      checkoutId,
      checkout.transactionId,
      eventId,
      checkout.status,
      checkout.amount ?? null,
      checkout.currency ?? null,
      JSON.stringify(checkout.raw ?? {}),
      now,
    ],
  );

  if (order.payment_status !== internalStatus) {
    // Ciclo 31: derivar fulfillment cuando pago entra a terminal-rechazado.
    const derivedStatus = sumup.deriveFulfillmentFromPayment(order.status, internalStatus);
    await query(
      `UPDATE orders
          SET payment_status            = $1,
              status                    = COALESCE($2, status),
              sumup_transaction_id      = COALESCE($3, sumup_transaction_id),
              sumup_transaction_code    = COALESCE($4, sumup_transaction_code),
              sumup_transaction_status  = COALESCE($5, sumup_transaction_status),
              sumup_transaction_at      = COALESCE($6, sumup_transaction_at),
              card_scheme               = COALESCE($7, card_scheme),
              payment_updated_at        = $8
        WHERE id = $9`,
      [
        internalStatus,
        derivedStatus,
        checkout.transactionId,
        checkout.transactionCode,
        checkout.transactionStatus,
        checkout.transactionAt,
        checkout.cardScheme,
        now,
        order.id,
      ],
    );
    console.log(
      `[payments/sumup/result] order=${order.id} checkout=${checkoutId} ` +
      `${order.payment_status} → ${internalStatus} (${checkout.status})`,
    );

    const { rows: [fresh] } = await query('SELECT * FROM orders WHERE id = $1', [order.id]);
    order = fresh;
  }

  res.json(buildDto(order, (checkout.status || '').toUpperCase() || null));
});

module.exports = router;
