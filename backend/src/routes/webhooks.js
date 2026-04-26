/**
 * SumUp webhook receiver — POST /webhook/sumup
 *
 * Responsabilidades:
 *   1. Responder 2xx rápido a SumUp.
 *   2. Procesar el evento CHECKOUT_STATUS_CHANGED actualizando `orders` y
 *      auditando en `payment_events`.
 *   3. Ser idempotente frente a reintentos de SumUp.
 *
 * Ciclo 26 — Option A: HMAC signature verification removed entirely. SumUp
 * Dashboard does not expose a per-endpoint "Signing secret" for webhooks, so
 * the only authoritative verification we can do is refetch checkout state
 * from SumUp (see Capa A below).
 *
 * Ciclo 45: la columna huérfana `payment_events.signature_ok` (siempre NULL
 * desde Ciclo 26) fue dropeada en migración 008.
 *
 * Idempotencia — estrategia de dos capas:
 *
 *   Capa A — comparación de estado (primaria):
 *     El payload SumUp es minimal: {event_type, id=checkout_id}. Un reintento
 *     envía bytes idénticos; por tanto NO existe un event_id natural y
 *     estable en el cuerpo. La dedup robusta es consultar SumUp (status
 *     autoritativo) y comparar contra `orders.payment_status`. Si el estado
 *     ya coincide, la transición ya fue aplicada — ACK sin side-effects.
 *     Este round-trip a SumUp es también la defensa contra payloads falsos:
 *     un atacante no puede forzar una transición sin un checkout válido.
 *
 *   Capa B — índice único parcial sobre event_id (defensivo):
 *     Si en el futuro SumUp incluye un `event_id` estable por evento, el
 *     INSERT ... ON CONFLICT (event_id) lo aprovechará automáticamente. Hoy
 *     event_id se completa con sha256(rawBody) para capturar exact replays
 *     bit-a-bit.
 *
 * Política de response codes:
 *   200 — procesado, idempotente, o evento ignorable.
 *   400 — body malformado.
 *   500 — error transitorio (DB / SumUp API) — SumUp reintentará.
 */

const express = require('express');
const crypto = require('crypto');
const { query } = require('../models/database');
const sumup = require('../utils/sumup');

const router = express.Router();

const RELEVANT_EVENT_TYPES = new Set(['CHECKOUT_STATUS_CHANGED']);

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Ciclo 61 (R1 — multi-shape): SumUp envía payloads heterogéneos según el
// canal (Card Widget v2, Hosted Checkout, sandbox). Extraemos checkoutId y
// eventType desde todas las formas conocidas para no perder eventos válidos.
function extractEvent(payload) {
  if (!payload || typeof payload !== 'object') {
    return { eventType: null, checkoutId: null };
  }
  const eventType =
    payload.event_type ||
    payload.eventType ||
    payload.type ||
    (payload.event && (payload.event.type || payload.event.event_type)) ||
    null;
  const checkoutId =
    payload.id ||
    payload.checkout_id ||
    payload.checkoutId ||
    (payload.data && (payload.data.id || payload.data.checkout_id || payload.data.checkoutId)) ||
    (payload.payload && (payload.payload.id || payload.payload.checkout_id)) ||
    (payload.resource && (payload.resource.id || payload.resource.checkout_id)) ||
    null;
  return { eventType, checkoutId };
}

router.post(
  '/webhook/sumup',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body || '');
    const receivedAt = new Date().toISOString();

    // R4 — logging crudo (cabeceras, longitud, body como string truncado).
    // Útil en sandbox donde el shape exacto del payload varía y el atributo
    // que dispara el 400 suele ser invisible sin esto.
    const headerSnapshot = {
      'content-type':     req.headers['content-type'],
      'user-agent':       req.headers['user-agent'],
      'x-sumup-event':    req.headers['x-sumup-event'],
      'x-payload-signature': req.headers['x-payload-signature'],
      'x-sumup-signature':  req.headers['x-sumup-signature'],
    };
    const bodyPreview = rawBody.length ? rawBody.toString('utf8').slice(0, 1024) : '';
    console.log(
      `[webhook/sumup] received_at=${receivedAt} bytes=${rawBody.length} ` +
      `headers=${JSON.stringify(headerSnapshot)} body_preview=${bodyPreview}`,
    );

    if (rawBody.length === 0) {
      // SumUp envía probes vacíos al validar la URL en el dashboard.
      console.log('[webhook/sumup] ignored=empty_body (probe?)');
      return res.status(200).json({ ok: true, ignored: 'empty_body' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      // R1 — antes devolvía 400; ahora ACK con 200 + ignored para evitar
      // que SumUp deje el endpoint como "fallido" en sandbox.
      console.warn(`[webhook/sumup] ignored=invalid_json err=${err.message}`);
      return res.status(200).json({ ok: true, ignored: 'invalid_json' });
    }

    const { eventType, checkoutId } = extractEvent(payload);
    console.log(
      `[webhook/sumup] parsed event_type=${eventType || 'NULL'} ` +
      `checkout_id=${checkoutId || 'NULL'} keys=${Object.keys(payload).join(',')}`,
    );

    if (!checkoutId) {
      // R1 — sin checkoutId no podemos hacer nada útil, pero ACK 200.
      return res.status(200).json({ ok: true, ignored: 'no_checkout_id' });
    }

    if (!eventType) {
      // R1 — algunos eventos legacy no traen tipo; intentamos procesarlos
      // como CHECKOUT_STATUS_CHANGED dado que tenemos checkoutId.
      console.log('[webhook/sumup] event_type missing, asumiendo CHECKOUT_STATUS_CHANGED');
    } else if (!RELEVANT_EVENT_TYPES.has(eventType)) {
      return res.status(200).json({ ok: true, ignored: 'event_type_not_handled', event_type: eventType });
    }

    // event_id estable: preferimos el que provea SumUp en el payload; si no,
    // caemos en sha256(rawBody) que coincide entre reintentos bit-a-bit.
    // Esto alimenta la Capa B (UNIQUE parcial) sin requerir contrato
    // adicional de SumUp.
    const eventId =
      payload.event_id ||
      payload.eventId ||
      `sha:${sha256Hex(rawBody)}`;

    const { rows: orderRows } = await query(
      'SELECT id, payment_status FROM orders WHERE sumup_checkout_id = $1 LIMIT 1',
      [checkoutId],
    );
    const order = orderRows[0];

    if (!order) {
      return res.status(200).json({ ok: true, ignored: 'order_not_found' });
    }

    // Capa B: inserción con dedup por event_id. Si ON CONFLICT dispara,
    // es un replay bit-a-bit y salimos sin tocar estado.
    // R1 — eventType puede ser null (payload legacy); usamos default
    // CHECKOUT_STATUS_CHANGED para mantener consistencia en la tabla audit.
    const insertResult = await query(
      `INSERT INTO payment_events
         (order_id, provider, event_type, checkout_id, event_id, raw_payload)
       VALUES ($1, 'sumup', $2, $3, $4, $5::jsonb)
       ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [order.id, eventType || 'CHECKOUT_STATUS_CHANGED', checkoutId, eventId, JSON.stringify(payload)],
    );

    if (insertResult.rows.length === 0) {
      return res.status(200).json({ ok: true, idempotent: 'event_id_replay' });
    }

    const eventRowId = insertResult.rows[0].id;

    // Capa A: estado autoritativo desde SumUp.
    let checkout;
    try {
      checkout = await sumup.getCheckout(checkoutId);
    } catch (err) {
      console.error('[webhook/sumup] getCheckout failed:', err.message);
      return res.status(500).json({ error: 'upstream_fetch_failed' });
    }

    const internalStatus = sumup.mapStatus(checkout.status);
    const now = new Date();

    if (order.payment_status === internalStatus) {
      // Estado ya sincronizado — solo completamos el audit row.
      await query(
        `UPDATE payment_events
            SET status         = $1,
                transaction_id = $2,
                amount         = $3,
                currency       = $4,
                processed_at   = $5
          WHERE id = $6`,
        [
          checkout.status,
          checkout.transactionId,
          checkout.amount ?? null,
          checkout.currency ?? null,
          now,
          eventRowId,
        ],
      );
      return res.status(200).json({ ok: true, idempotent: 'status_already_synced' });
    }

    // Transición real del estado.
    // Ciclo 31 (Option C, DG #3): card_scheme se puebla desde la respuesta
    // autoritativa de SumUp (transactions[0].card.type vía extractCardScheme
    // dentro del adapter). COALESCE para no sobrescribir un scheme ya
    // capturado por una transición previa (ej. completeCheckout headless).
    // Ciclo 82: agregamos transaction_code/status/at (transactions[0]) para
    // trazabilidad de soporte (transaction_code es el id que SumUp pide al
    // abrir tickets). COALESCE preserva valores capturados por sync previo.
    // Ciclo 31: si el pago entra en estado terminal-rechazado, derivar el
    // fulfillment a 'cancelled' (en el mismo UPDATE para evitar inconsistencias
    // visibles en Vista de Cocina). status=COALESCE(...) preserva el valor
    // actual cuando no hay derivación.
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

    await query(
      `UPDATE payment_events
          SET status         = $1,
              transaction_id = $2,
              amount         = $3,
              currency       = $4,
              processed_at   = $5
        WHERE id = $6`,
      [
        checkout.status,
        checkout.transactionId,
        checkout.amount ?? null,
        checkout.currency ?? null,
        now,
        eventRowId,
      ],
    );

    console.log(
      `[webhook/sumup] order=${order.id} checkout=${checkoutId} ` +
      `${order.payment_status} → ${internalStatus} (${checkout.status})`,
    );

    res.status(200).json({ ok: true, status: internalStatus });
  },
);

module.exports = router;
