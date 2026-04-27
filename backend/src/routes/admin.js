const express = require('express');
const { query, getClient } = require('../models/database');

const router = express.Router();

// Ciclo 99 — Vocabulario fulfillment + reglas de transición.
// Coherente con CHECK constraint en migración 010.
const FULFILLMENT_STATUSES = [
  'pending',
  'in_progress',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
];

const VALID_PAYMENT_STATUSES = [
  'pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded',
];

// Whitelist de transiciones permitidas. Estados terminales (cancelled, returned)
// no pueden salir. Sólo `delivered` permite `returned` (post-fulfillment).
const ALLOWED_TRANSITIONS = {
  pending:           ['in_progress', 'cancelled'],
  in_progress:       ['out_for_delivery', 'cancelled'],
  out_for_delivery:  ['delivered', 'cancelled'],
  delivered:         ['returned'],
  cancelled:         [],
  returned:          [],
};

// Avanzar el lifecycle (in_progress / out_for_delivery / delivered) requiere
// pago confirmado. La regla está documentada en migración 010 (no en DB,
// porque payment_status puede mutar de forma asíncrona vía webhook/sync).
const PAID_REQUIRED_TARGETS = new Set(['in_progress', 'out_for_delivery', 'delivered']);

function buildDateFilter(req, tableAlias = 'o', startIndex = 1) {
  const { from, to } = req.query;
  let filter = '';
  const params = [];
  let idx = startIndex;
  if (from) {
    filter += ` AND ${tableAlias}.created_at >= $${idx++}`;
    params.push(from);
  }
  if (to) {
    filter += ` AND ${tableAlias}.created_at < ($${idx++}::date + interval '1 day')`;
    params.push(to);
  }
  return { filter, params, nextIndex: idx };
}

// GET /api/admin/dashboard - Overview stats
router.get('/admin/dashboard', async (req, res) => {
  const { filter, params } = buildDateFilter(req, 'o');

  const totalProducts = (await query('SELECT COUNT(*) as count FROM products')).rows[0].count;
  const activeProducts = (await query('SELECT COUNT(*) as count FROM products WHERE available = 1')).rows[0].count;
  const totalOrders = (await query(`SELECT COUNT(*) as count FROM orders o WHERE 1=1 ${filter}`, params)).rows[0].count;
  const totalRevenue = (await query(`SELECT COALESCE(SUM(total), 0) as total FROM orders o WHERE 1=1 ${filter}`, params)).rows[0].total;
  const avgOrderValue = (await query(`SELECT COALESCE(AVG(total), 0) as avg FROM orders o WHERE 1=1 ${filter}`, params)).rows[0].avg;

  res.json({
    total_products: Number(totalProducts),
    active_products: Number(activeProducts),
    total_orders: Number(totalOrders),
    total_revenue: Number(totalRevenue),
    avg_order_value: Math.round(Number(avgOrderValue)),
  });
});

// GET /api/admin/inventory - Product inventory with stock info
router.get('/admin/inventory', async (req, res) => {
  const { filter, params } = buildDateFilter(req, 'o');

  const { rows } = await query(`
    SELECT p.id, p.name, p.price, p.available, p.stock, p.image_url,
           c.display_name as category,
           COALESCE(SUM(oi.quantity), 0) as total_sold,
           COALESCE(SUM(oi.subtotal), 0) as total_revenue
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON oi.order_id = o.id ${filter ? 'AND 1=1 ' + filter : ''}
    GROUP BY p.id, p.name, p.price, p.available, p.stock, p.image_url, c.display_name, c.sort_order, p.sort_order
    ORDER BY c.sort_order, p.sort_order
  `, params);

  res.json(rows);
});

// GET /api/admin/best-sellers - Top selling products
router.get('/admin/best-sellers', async (req, res) => {
  const { filter, params } = buildDateFilter(req, 'o');

  const { rows } = await query(`
    SELECT p.id, p.name, p.price, p.image_url,
           c.display_name as category,
           SUM(oi.quantity) as total_sold,
           SUM(oi.subtotal) as total_revenue,
           COUNT(DISTINCT oi.order_id) as order_count
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    JOIN orders o ON oi.order_id = o.id
    WHERE 1=1 ${filter}
    GROUP BY p.id, p.name, p.price, p.image_url, c.display_name
    ORDER BY total_sold DESC
    LIMIT 10
  `, params);

  res.json(rows);
});

// GET /api/admin/margin-analysis - Products by margin contribution
router.get('/admin/margin-analysis', async (req, res) => {
  const { filter, params } = buildDateFilter(req, 'o');

  const { rows } = await query(`
    SELECT p.id, p.name, p.price, p.image_url,
           c.display_name as category,
           COALESCE(SUM(oi.quantity), 0) as total_sold,
           COALESCE(SUM(oi.subtotal), 0) as total_revenue,
           p.price as unit_price
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders o ON oi.order_id = o.id ${filter ? 'AND 1=1 ' + filter : ''}
    GROUP BY p.id, p.name, p.price, p.image_url, c.display_name
    ORDER BY total_revenue DESC
  `, params);

  res.json(rows);
});

// GET /api/admin/orders-history - Recent orders
router.get('/admin/orders-history', async (req, res) => {
  const { limit = 20 } = req.query;

  const { rows } = await query(`
    SELECT o.id, o.status, o.contact_name, o.payment_method,
           o.subtotal, o.total, o.created_at,
           COUNT(oi.id) as item_count
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id, o.status, o.contact_name, o.payment_method, o.subtotal, o.total, o.created_at
    ORDER BY o.created_at DESC
    LIMIT $1
  `, [Number(limit)]);

  res.json(rows);
});

// GET /api/admin/sales-summary - Sales data for AI context
router.get('/admin/sales-summary', async (req, res) => {
  const { rows: byCategory } = await query(`
    SELECT c.display_name as category,
           COUNT(DISTINCT oi.order_id) as orders,
           SUM(oi.quantity) as units_sold,
           SUM(oi.subtotal) as revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    GROUP BY c.id, c.display_name
    ORDER BY revenue DESC
  `);

  const { rows: byPayment } = await query(`
    SELECT payment_method, COUNT(*) as count, SUM(total) as revenue
    FROM orders
    GROUP BY payment_method
    ORDER BY count DESC
  `);

  const { rows: recentTrend } = await query(`
    SELECT DATE(created_at) as date,
           COUNT(*) as orders,
           SUM(total) as revenue
    FROM orders
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `);

  res.json({ by_category: byCategory, by_payment: byPayment, recent_trend: recentTrend });
});

// GET /api/admin/customers - Customer analytics
router.get('/admin/customers', async (req, res) => {
  const { filter, params } = buildDateFilter(req, 'o');

  const { rows } = await query(`
    SELECT c.id, c.name, c.email, c.phone, c.created_at,
           COUNT(DISTINCT o.id) as total_orders,
           COALESCE(SUM(o.total), 0) as total_spent,
           COALESCE(AVG(o.total), 0) as avg_order_value,
           MAX(o.created_at) as last_order_date
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed' ${filter}
    GROUP BY c.id, c.name, c.email, c.phone, c.created_at
    ORDER BY total_spent DESC
  `, params);

  res.json(rows.map(c => ({
    ...c,
    avg_order_value: Math.round(Number(c.avg_order_value)),
  })));
});

// GET /api/admin/customers/:id - Customer detail with purchase history
router.get('/admin/customers/:id', async (req, res) => {
  const { id } = req.params;

  const { rows: customerRows } = await query(`
    SELECT c.id, c.name, c.email, c.phone, c.created_at,
           COUNT(DISTINCT o.id) as total_orders,
           COALESCE(SUM(o.total), 0) as total_spent,
           COALESCE(AVG(o.total), 0) as avg_order_value
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
    WHERE c.id = $1
    GROUP BY c.id, c.name, c.email, c.phone, c.created_at
  `, [id]);

  const customer = customerRows[0];
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { rows: favoriteProducts } = await query(`
    SELECT p.name, p.price, c2.display_name as category,
           SUM(oi.quantity) as times_ordered,
           SUM(oi.subtotal) as total_spent_product
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    JOIN categories c2 ON p.category_id = c2.id
    WHERE o.customer_id = $1 AND o.status = 'completed'
    GROUP BY p.id, p.name, p.price, c2.display_name
    ORDER BY times_ordered DESC
    LIMIT 5
  `, [id]);

  const { rows: recentOrders } = await query(`
    SELECT o.id, o.total, o.payment_method, o.created_at,
           COUNT(oi.id) as item_count
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_id = $1 AND o.status = 'completed'
    GROUP BY o.id, o.total, o.payment_method, o.created_at
    ORDER BY o.created_at DESC
    LIMIT 10
  `, [id]);

  res.json({
    ...customer,
    avg_order_value: Math.round(Number(customer.avg_order_value)),
    favorite_products: favoriteProducts,
    recent_orders: recentOrders,
  });
});

// GET /api/admin/customers-summary - Aggregated customer stats
router.get('/admin/customers-summary', async (req, res) => {
  const { filter, params } = buildDateFilter(req, 'o');

  const totalCustomers = (await query('SELECT COUNT(*) as count FROM customers')).rows[0].count;
  const activeCustomers = (await query(`
    SELECT COUNT(DISTINCT customer_id) as count FROM orders o
    WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '30 days' ${filter}
  `, params)).rows[0].count;
  const totalRevenue = (await query(`SELECT COALESCE(SUM(total), 0) as total FROM orders o WHERE status = 'completed' ${filter}`, params)).rows[0].total;
  const avgLifetimeValue = (await query(`
    SELECT COALESCE(AVG(ltv), 0) as avg_ltv FROM (
      SELECT SUM(total) as ltv FROM orders o WHERE status = 'completed' ${filter} GROUP BY customer_id
    ) sub
  `, params)).rows[0].avg_ltv;

  // Top 5 by revenue contribution
  const { rows: topByRevenue } = await query(`
    SELECT c.id, c.name,
           SUM(o.total) as total_spent,
           COUNT(o.id) as order_count
    FROM customers c
    JOIN orders o ON o.customer_id = c.id AND o.status = 'completed' ${filter}
    GROUP BY c.id, c.name
    ORDER BY total_spent DESC
    LIMIT 5
  `, params);

  // Top 5 by frequency
  const { rows: topByFrequency } = await query(`
    SELECT c.id, c.name,
           COUNT(o.id) as order_count,
           SUM(o.total) as total_spent
    FROM customers c
    JOIN orders o ON o.customer_id = c.id AND o.status = 'completed' ${filter}
    GROUP BY c.id, c.name
    ORDER BY order_count DESC
    LIMIT 5
  `, params);

  res.json({
    total_customers: Number(totalCustomers),
    active_customers_30d: Number(activeCustomers),
    total_revenue: Number(totalRevenue),
    avg_lifetime_value: Math.round(Number(avgLifetimeValue)),
    top_by_revenue: topByRevenue,
    top_by_frequency: topByFrequency,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo 99 — Admin orders search + status mutation
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/orders — búsqueda con filtros y paginación
//
// Query params (todos opcionales):
//   q                — texto libre. Match en id (si numérico), contact_name,
//                      contact_email, contact_phone, address_commune,
//                      address_city, sumup_transaction_code.
//   status           — uno o más fulfillment statuses (csv).
//   payment_status   — uno o más payment statuses (csv).
//   payment_method   — single value (efectivo|transferencia|tarjeta|...).
//   from, to         — rango de fechas (YYYY-MM-DD) sobre created_at.
//   sort             — created_at_desc (default) | created_at_asc |
//                      total_desc | total_asc.
//   limit            — 1..100 (default 20).
//   offset           — >=0 (default 0).
//
// Respuesta: { orders: [...], pagination: { total, limit, offset } }
router.get('/admin/orders', async (req, res) => {
  const {
    q,
    status,
    payment_status,
    payment_method,
    from,
    to,
    sort = 'created_at_desc',
  } = req.query;

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const conditions = [];
  const params = [];
  let idx = 1;

  // Texto libre — búsqueda case-insensitive en múltiples columnas.
  if (q && q.trim()) {
    const trimmed = q.trim();
    const like = `%${trimmed}%`;
    const numeric = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;

    const orParts = [
      `o.contact_name ILIKE $${idx}`,
      `o.contact_email ILIKE $${idx}`,
      `o.contact_phone ILIKE $${idx}`,
      `o.address_commune ILIKE $${idx}`,
      `o.address_city ILIKE $${idx}`,
      `o.sumup_transaction_code ILIKE $${idx}`,
    ];
    params.push(like);
    idx++;

    if (numeric !== null) {
      orParts.push(`o.id = $${idx}`);
      params.push(numeric);
      idx++;
    }

    conditions.push(`(${orParts.join(' OR ')})`);
  }

  // Filtro por fulfillment status (csv).
  if (status) {
    const values = String(status).split(',').map(s => s.trim()).filter(Boolean);
    const whitelisted = values.filter(v => FULFILLMENT_STATUSES.includes(v));
    if (whitelisted.length > 0) {
      const placeholders = whitelisted.map(() => `$${idx++}`).join(', ');
      conditions.push(`o.status IN (${placeholders})`);
      params.push(...whitelisted);
    }
  }

  // Filtro por payment_status (csv).
  if (payment_status) {
    const values = String(payment_status).split(',').map(s => s.trim()).filter(Boolean);
    const whitelisted = values.filter(v => VALID_PAYMENT_STATUSES.includes(v));
    if (whitelisted.length > 0) {
      const placeholders = whitelisted.map(() => `$${idx++}`).join(', ');
      conditions.push(`o.payment_status IN (${placeholders})`);
      params.push(...whitelisted);
    }
  }

  // Filtro por payment_method.
  if (payment_method) {
    conditions.push(`o.payment_method = $${idx++}`);
    params.push(String(payment_method));
  }

  // Rango de fechas.
  if (from) {
    conditions.push(`o.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`o.created_at < ($${idx++}::date + interval '1 day')`);
    params.push(to);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort whitelist — evita SQL injection por sort param.
  const sortMap = {
    created_at_desc: 'o.created_at DESC',
    created_at_asc:  'o.created_at ASC',
    total_desc:      'o.total DESC, o.created_at DESC',
    total_asc:       'o.total ASC, o.created_at DESC',
  };
  const orderBy = sortMap[sort] || sortMap.created_at_desc;

  // COUNT total para pagination.
  const countSql = `SELECT COUNT(*) AS count FROM orders o ${whereClause}`;
  const { rows: countRows } = await query(countSql, params);
  const total = Number(countRows[0].count);

  // Listado con item_count + items[] agregados (Ciclo 25 — Vista de Cocina).
  // json_agg + FILTER evita filas null cuando no hay items, y ORDER BY oi.id
  // mantiene el orden original de inserción.
  const listSql = `
    SELECT o.id, o.status, o.payment_status, o.payment_method, o.payment_currency,
           o.contact_name, o.contact_email, o.contact_phone,
           o.address_street, o.address_number, o.address_commune, o.address_city, o.address_notes,
           o.customer_instructions,
           o.subtotal, o.total,
           o.card_scheme,
           o.sumup_checkout_id, o.sumup_transaction_id,
           o.sumup_transaction_code, o.sumup_transaction_status, o.sumup_transaction_at,
           o.payment_updated_at, o.created_at, o.updated_at,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
           COALESCE(
             (
               SELECT json_agg(json_build_object(
                 'id', oi.id,
                 'product_id', oi.product_id,
                 'name', oi.name,
                 'price', oi.price,
                 'quantity', oi.quantity,
                 'subtotal', oi.subtotal,
                 'notes', oi.notes
               ) ORDER BY oi.id)
               FROM order_items oi
               WHERE oi.order_id = o.id
             ),
             '[]'::json
           ) AS items
      FROM orders o
      ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${idx++} OFFSET $${idx++}
  `;
  const listParams = [...params, limit, offset];
  const { rows } = await query(listSql, listParams);

  res.json({
    orders: rows.map(o => ({
      ...o,
      item_count: Number(o.item_count),
      items: Array.isArray(o.items) ? o.items : [],
    })),
    pagination: { total, limit, offset },
  });
});

// PATCH /api/admin/orders/:id/status
//
// Body: { status: <fulfillment_status>, reason?: string }
//
// Reglas:
//   1. status target debe estar en FULFILLMENT_STATUSES.
//   2. Transición debe estar permitida en ALLOWED_TRANSITIONS.
//   3. Avanzar a in_progress/out_for_delivery/delivered requiere
//      payment_status='paid' (PAID_REQUIRED_TARGETS).
//   4. Same-status → 400 no_change (no se escribe audit).
//   5. UPDATE orders + INSERT orders_audit en transacción.
//   6. Audit registra: action=status_change, field=status, prev/new,
//      changed_by (admin_user.id), changed_by_email (snapshot username),
//      reason (libre del operador), metadata (ip, user_agent).
router.patch('/admin/orders/:id/status', async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'invalid_order_id' });
  }

  const { status: newStatus, reason } = req.body || {};

  if (!newStatus || typeof newStatus !== 'string') {
    return res.status(400).json({ error: 'status_required' });
  }

  if (!FULFILLMENT_STATUSES.includes(newStatus)) {
    return res.status(400).json({
      error: 'invalid_status',
      allowed: FULFILLMENT_STATUSES,
    });
  }

  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return res.status(400).json({ error: 'reason_must_be_string' });
  }

  const reasonTrimmed = typeof reason === 'string' ? reason.trim() : null;
  if (reasonTrimmed && reasonTrimmed.length > 1000) {
    return res.status(400).json({ error: 'reason_too_long', max: 1000 });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock row para evitar race conditions con webhooks/syncs concurrentes
    // que pudieran cambiar payment_status entremedio.
    const { rows: orderRows } = await client.query(
      'SELECT id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = orderRows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'order_not_found' });
    }

    const currentStatus = order.status;

    if (currentStatus === newStatus) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'no_change',
        message: 'La orden ya se encuentra en el estado solicitado',
        current_status: currentStatus,
      });
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'invalid_transition',
        from: currentStatus,
        to: newStatus,
        allowed_targets: allowed,
      });
    }

    if (PAID_REQUIRED_TARGETS.has(newStatus) && order.payment_status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'payment_not_confirmed',
        message: 'No se puede avanzar el estado: el pago aún no está confirmado',
        current_payment_status: order.payment_status,
      });
    }

    // UPDATE orders.status (+ updated_at).
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, orderId],
    );

    // Snapshot identidad del admin. admin_users no tiene email — usamos
    // username como identificador canónico (la columna se llama
    // changed_by_email por consistencia con el design original, pero el
    // valor es el username del operador para preservar trazabilidad si
    // el admin se elimina).
    const changedBy = req.authUser?.user_id ?? null;
    const changedByEmail = req.authUser?.username ?? null;

    const metadata = {
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      user_agent: req.headers['user-agent'] || null,
      admin_display_name: req.authUser?.display_name || null,
    };

    await client.query(
      `INSERT INTO orders_audit
         (order_id, action, field, previous_value, new_value,
          changed_by, changed_by_email, reason, metadata)
       VALUES ($1, 'status_change', 'status', $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        orderId,
        currentStatus,
        newStatus,
        changedBy,
        changedByEmail,
        reasonTrimmed || null,
        JSON.stringify(metadata),
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Devolver la orden actualizada con item_count, fuera de la transacción.
  const { rows: [updated] } = await query(
    `SELECT o.id, o.status, o.payment_status, o.payment_method, o.payment_currency,
            o.contact_name, o.contact_email, o.contact_phone,
            o.address_street, o.address_number, o.address_commune, o.address_city, o.address_notes,
            o.subtotal, o.total,
            o.card_scheme,
            o.sumup_checkout_id, o.sumup_transaction_id,
            o.sumup_transaction_code, o.sumup_transaction_status, o.sumup_transaction_at,
            o.payment_updated_at, o.created_at, o.updated_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
      WHERE o.id = $1`,
    [orderId],
  );

  res.json({
    ...updated,
    item_count: Number(updated.item_count),
  });
});

module.exports = router;
