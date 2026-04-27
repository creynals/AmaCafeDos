const express = require('express');
const { query, getClient } = require('../models/database');
const sumup = require('../utils/sumup');

const router = express.Router();

/**
 * Métodos de pago aceptados por el backend.
 *
 * Ciclo 31 (Option C): unificamos los valores de tarjeta a 'tarjeta' a nivel
 * de almacenamiento. El frontend mantiene 2 botones (débito/crédito) por UX,
 * pero ambos se normalizan a 'tarjeta' acá. Mantenemos los strings legacy
 * en la whitelist para no romper integraciones externas durante la
 * transición — todos se persisten como 'tarjeta'. La marca real (VISA/
 * MASTERCARD/...) se puebla en orders.card_scheme post-autorización vía
 * webhook (migración 007).
 */
const VALID_PAYMENT_METHODS = new Set([
  'efectivo',
  'transferencia',
  'tarjeta',
  'tarjeta_debito',  // legacy, se normaliza a 'tarjeta'
  'tarjeta_credito', // legacy, se normaliza a 'tarjeta'
]);

const CARD_METHODS = new Set(['tarjeta', 'tarjeta_debito', 'tarjeta_credito']);

function normalizePaymentMethod(method) {
  return CARD_METHODS.has(method) ? 'tarjeta' : method;
}

// Cycle 67: instrucciones libres del cliente a nivel de orden (paso "Resumen"
// del checkout). Distintas de address_notes (entrega) y de order_items.notes
// (por producto). Cap en 1000 chars para evitar abuso.
const CUSTOMER_INSTRUCTIONS_MAX_LEN = 1000;

function normalizeCustomerInstructions(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// POST /api/orders - Create order from cart
router.post('/orders', async (req, res) => {
  const { cart_id, contact, address, payment_method, customer_instructions } = req.body;

  // Validate required fields
  if (!cart_id) return res.status(400).json({ error: 'cart_id es requerido' });
  if (!contact?.name || !contact?.email || !contact?.phone) {
    return res.status(400).json({ error: 'Datos de contacto incompletos (name, email, phone)' });
  }
  if (!address?.street || !address?.number || !address?.commune || !address?.city) {
    return res.status(400).json({ error: 'Direccion incompleta (street, number, commune, city)' });
  }
  if (!payment_method) {
    return res.status(400).json({ error: 'payment_method es requerido' });
  }
  if (!VALID_PAYMENT_METHODS.has(payment_method)) {
    return res.status(400).json({
      error: `Metodo de pago invalido. Opciones: ${[...VALID_PAYMENT_METHODS].join(', ')}`,
    });
  }
  if (
    customer_instructions != null &&
    typeof customer_instructions === 'string' &&
    customer_instructions.length > CUSTOMER_INSTRUCTIONS_MAX_LEN
  ) {
    return res.status(400).json({
      error: `customer_instructions excede el máximo de ${CUSTOMER_INSTRUCTIONS_MAX_LEN} caracteres`,
    });
  }
  const normalizedInstructions = normalizeCustomerInstructions(customer_instructions);

  const normalizedMethod = normalizePaymentMethod(payment_method);
  const isCardPayment = normalizedMethod === 'tarjeta';

  // Get cart items
  const { rows: cartItems } = await query(`
    SELECT ci.quantity, ci.notes,
           p.id as product_id, p.name, p.price
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1
  `, [cart_id]);

  if (cartItems.length === 0) {
    return res.status(400).json({ error: 'El carrito esta vacio' });
  }

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal; // No shipping for MVP

  // Create order in a transaction
  const client = await getClient();
  let orderId;
  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(`
      INSERT INTO orders (cart_id, contact_name, contact_email, contact_phone,
        address_street, address_number, address_commune, address_city, address_notes,
        payment_method, subtotal, total, customer_instructions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id
    `, [
      cart_id, contact.name, contact.email, contact.phone,
      address.street, address.number, address.commune, address.city, address.notes || null,
      normalizedMethod, subtotal, total, normalizedInstructions
    ]);

    orderId = orderRows[0].id;

    for (const item of cartItems) {
      await client.query(`
        INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [orderId, item.product_id, item.name, item.price, item.quantity, item.price * item.quantity, item.notes || null]);
    }

    // Clear the cart
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart_id]);
    await client.query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [cart_id]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Card payment: initiate SumUp checkout out-of-band (post-commit) so a
  // SumUp upstream failure no impide registrar la orden. Si falla la creación
  // del checkout, devolvemos la orden con payment.error y payment_status
  // queda en 'pending' (default); el cliente puede reintentar.
  let paymentBlock = null;
  if (isCardPayment) {
    try {
      const checkout = await sumup.createCheckout({
        orderId,
        amount: total,
        description: `Pedido amaCafe #${orderId}`,
      });

      await query(
        'UPDATE orders SET sumup_checkout_id = $1, payment_status = $2, payment_currency = $3 WHERE id = $4',
        [checkout.checkoutId, 'pending', checkout.currency, orderId],
      );

      paymentBlock = {
        provider: 'sumup',
        checkout_id: checkout.checkoutId,
        merchant_code: checkout.merchantCode,
        amount: checkout.amount,
        currency: checkout.currency,
      };
    } catch (err) {
      console.error(`[orders] SumUp createCheckout failed for order ${orderId}:`, err.message);
      paymentBlock = {
        provider: 'sumup',
        error: err.code === 'config_missing'
          ? 'sumup_not_configured'
          : 'sumup_unavailable',
        error_message: err.message,
      };
    }
  }

  // Return order confirmation
  const { rows: [order] } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const { rows: items } = await query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

  res.status(201).json({
    order_id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    contact: {
      name: order.contact_name,
      email: order.contact_email,
      phone: order.contact_phone,
    },
    address: {
      street: order.address_street,
      number: order.address_number,
      commune: order.address_commune,
      city: order.address_city,
      notes: order.address_notes,
    },
    payment_method: order.payment_method,
    payment: paymentBlock,
    customer_instructions: order.customer_instructions,
    items: items.map(i => ({
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })),
    subtotal: order.subtotal,
    total: order.total,
    created_at: order.created_at,
  });
});

function serializeOrder(order, items) {
  return {
    order_id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    card_scheme: order.card_scheme,
    sumup_checkout_id: order.sumup_checkout_id,
    sumup_transaction_id: order.sumup_transaction_id,
    // Ciclo 82: trazabilidad para soporte/reconciliación SumUp.
    sumup_transaction_code:   order.sumup_transaction_code   ?? null,
    sumup_transaction_status: order.sumup_transaction_status ?? null,
    sumup_transaction_at:     order.sumup_transaction_at     ?? null,
    contact: {
      name: order.contact_name,
      email: order.contact_email,
      phone: order.contact_phone,
    },
    address: {
      street: order.address_street,
      number: order.address_number,
      commune: order.address_commune,
      city: order.address_city,
      notes: order.address_notes,
    },
    customer_instructions: order.customer_instructions ?? null,
    items: items.map(i => ({
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })),
    subtotal: order.subtotal,
    total: order.total,
    created_at: order.created_at,
  };
}

// GET /api/orders/:id - Get order details (used by frontend polling
// post-widget para detectar payment_status='paid' actualizado por el webhook).
router.get('/orders/:id', async (req, res) => {
  const { rows: orderRows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const order = orderRows[0];

  if (!order) {
    return res.status(404).json({ error: 'Pedido no encontrado' });
  }

  const { rows: items } = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

  res.json(serializeOrder(order, items));
});

// POST /api/orders/:id/sync-payment
//
// Ciclo 56 — fix Ciclo 55 (Pago en proceso stuck):
// El webhook de SumUp no es 100% confiable para Card Widget v2 en sandbox
// (puede no llegar nunca, o llegar fuera del timeout de polling de 60s).
// Cuando el widget reporta success en el browser, el frontend invoca este
// endpoint para sincronizar activamente el estado autoritativo desde SumUp
// (misma fuente que usa el webhook). Esto elimina la dependencia del webhook
// para el happy path; el webhook sigue funcionando como respaldo para
// transiciones de estado posteriores (refund, chargeback, etc.).
//
// Idempotencia: event_id determinístico `sync:{checkoutId}:{status}` evita
// audit rows duplicadas si el frontend reintenta el sync.
router.post('/orders/:id/sync-payment', async (req, res) => {
  const { rows: orderRows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const order = orderRows[0];

  if (!order) {
    return res.status(404).json({ error: 'Pedido no encontrado' });
  }

  if (!order.sumup_checkout_id) {
    return res.status(400).json({ error: 'order_has_no_checkout' });
  }

  let checkout;
  try {
    checkout = await sumup.getCheckout(order.sumup_checkout_id);
  } catch (err) {
    console.error(`[orders/sync-payment] getCheckout failed for order ${order.id}:`, err.message);
    return res.status(502).json({ error: 'upstream_fetch_failed', message: err.message });
  }

  const internalStatus = sumup.mapStatus(checkout.status);
  const now = new Date();
  const eventId = `sync:${order.sumup_checkout_id}:${(checkout.status || 'unknown').toUpperCase()}`;

  // Audit (idempotente por UNIQUE parcial sobre event_id).
  await query(
    `INSERT INTO payment_events
       (order_id, provider, event_type, checkout_id, transaction_id,
        event_id, status, amount, currency, raw_payload, processed_at)
     VALUES ($1, 'sumup', 'CHECKOUT_SYNC', $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
    [
      order.id,
      order.sumup_checkout_id,
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
    // Ciclo 82: persistimos transaction_code/status/at junto con id+scheme.
    // COALESCE asegura que un sync posterior no pise valores ya capturados.
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
      `[orders/sync-payment] order=${order.id} checkout=${order.sumup_checkout_id} ` +
      `${order.payment_status} → ${internalStatus} (${checkout.status}) ` +
      `tx_code=${checkout.transactionCode || 'NULL'}`,
    );
  }

  const { rows: [fresh] } = await query('SELECT * FROM orders WHERE id = $1', [order.id]);
  const { rows: items } = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

  res.json(serializeOrder(fresh, items));
});

module.exports = router;
