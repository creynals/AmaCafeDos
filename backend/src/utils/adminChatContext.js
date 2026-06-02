// Retrieval dirigido para el Asesor de Negocios (C203).
//
// El /admin/chat arma un snapshot fijo (top productos/clientes, tendencia 7d).
// Fuera de ese snapshot el modelo inventaba. Este módulo detecta entidades
// concretas en el mensaje del usuario (un #pedido, un cliente, un rango de
// fechas) y ejecuta queries PARAMETRIZADAS y acotadas para inyectar datos
// reales al contexto — sin dar SQL libre al LLM.
//
// Helpers de detección son puros (testeables sin DB). buildRetrievedContext
// es async y usa los predicados de buckets de C202 (countedSql) para mantener
// coherencia con las vistas Clientes/Órdenes.

const { query } = require('../models/database');
const { countedSql, confirmedSql, pendingSql } = require('./orderStatus');

const MONTHS_ES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

function formatPrice(n) {
  return `$${Number(n || 0).toLocaleString('es-CL')}`;
}

// "#204", "pedido 204", "orden #204", "order 204" → 204. Null si no hay match.
function extractOrderId(message) {
  if (typeof message !== 'string') return null;
  const m = message.match(/(?:#|\b(?:pedido|orden|order|n[uú]mero)\s*#?\s*)(\d{1,7})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// Detecta un rango de fechas explícito o relativo. Devuelve { from, to, label }
// con `from` inclusivo y `to` exclusivo (Date), o null. `now` inyectable para tests.
function detectPeriod(message, now = new Date()) {
  if (typeof message !== 'string') return null;
  const msg = message.toLowerCase();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (/\bhoy\b/.test(msg)) {
    const from = startOfDay(now);
    return { from, to: new Date(from.getTime() + 86400000), label: 'hoy' };
  }
  if (/\bayer\b/.test(msg)) {
    const to = startOfDay(now);
    return { from: new Date(to.getTime() - 86400000), to, label: 'ayer' };
  }
  if (/\b(esta semana|[uú]ltima semana|[uú]ltimos 7 d[ií]as)\b/.test(msg)) {
    const to = new Date(startOfDay(now).getTime() + 86400000);
    return { from: new Date(to.getTime() - 7 * 86400000), to, label: 'últimos 7 días' };
  }
  if (/\b(mes pasado|[uú]ltimo mes)\b/.test(msg)) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to, label: 'el mes pasado' };
  }
  if (/\beste mes\b/.test(msg)) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from, to, label: 'este mes' };
  }
  if (/\beste a[nñ]o\b/.test(msg)) {
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear() + 1, 0, 1),
      label: `${now.getFullYear()}`,
    };
  }
  // Nombre de mes, con año opcional: "marzo", "en mayo 2026".
  const monthMatch = msg.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de\s+)?(\d{4}))?/);
  if (monthMatch) {
    const monthIdx = MONTHS_ES[monthMatch[1]];
    const year = monthMatch[2] ? parseInt(monthMatch[2], 10) : now.getFullYear();
    const from = new Date(year, monthIdx, 1);
    const to = new Date(year, monthIdx + 1, 1);
    return { from, to, label: `${monthMatch[1]} ${year}` };
  }
  return null;
}

// Empareja un cliente del snapshot contra el mensaje (email exacto, nombre
// completo, o token de nombre de ≥4 chars). Devuelve hasta 2 ids.
function matchCustomerIds(message, customers) {
  if (typeof message !== 'string' || !Array.isArray(customers)) return [];
  const msg = message.toLowerCase();
  const ids = [];
  for (const c of customers) {
    const email = (c.email || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    if (!name && !email) continue;
    let hit = false;
    if (email && msg.includes(email)) hit = true;
    else if (name && msg.includes(name)) hit = true;
    else if (name.split(/\s+/).some((t) => t.length >= 4 && msg.includes(t))) hit = true;
    if (hit) ids.push(c.id);
    if (ids.length >= 2) break;
  }
  return ids;
}

async function orderBlock(orderId) {
  const { rows } = await query(
    `SELECT o.id, o.status, o.payment_status, o.payment_method, o.total, o.subtotal,
            o.created_at, o.contact_name, o.contact_email, o.address_commune, o.address_city
       FROM orders o WHERE o.id = $1`,
    [orderId],
  );
  if (!rows[0]) return `PEDIDO #${orderId}: no existe en la base de datos.`;
  const o = rows[0];
  const { rows: items } = await query(
    `SELECT oi.quantity, p.name, oi.subtotal
       FROM order_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1 ORDER BY oi.subtotal DESC`,
    [orderId],
  );
  const itemsText = items.length
    ? items.map((it) => `    - ${it.quantity}× ${it.name} (${formatPrice(it.subtotal)})`).join('\n')
    : '    (sin items)';
  return [
    `PEDIDO #${o.id} (datos reales):`,
    `  Cliente: ${o.contact_name || 'N/D'} <${o.contact_email || 'N/D'}>`,
    `  Fecha: ${new Date(o.created_at).toLocaleString('es-CL')}`,
    `  Estado: ${o.status} | Pago: ${o.payment_status} (${o.payment_method})`,
    `  Total: ${formatPrice(o.total)} | Comuna: ${o.address_commune || 'N/D'}, ${o.address_city || 'N/D'}`,
    `  Productos:`,
    itemsText,
  ].join('\n');
}

async function customerBlock(customerId) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.email, c.phone, c.created_at,
            COUNT(DISTINCT o.id) FILTER (WHERE ${countedSql('o')})   AS total_orders,
            COUNT(DISTINCT o.id) FILTER (WHERE ${pendingSql('o')})   AS pending_orders,
            COUNT(DISTINCT o.id) FILTER (WHERE ${confirmedSql('o')}) AS confirmed_orders,
            COALESCE(SUM(o.total) FILTER (WHERE ${countedSql('o')}), 0)   AS total_spent,
            COALESCE(SUM(o.total) FILTER (WHERE ${confirmedSql('o')}), 0) AS confirmed_spent
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
      WHERE c.id = $1
      GROUP BY c.id, c.name, c.email, c.phone, c.created_at`,
    [customerId],
  );
  if (!rows[0]) return null;
  const c = rows[0];
  const { rows: recent } = await query(
    `SELECT o.id, o.total, o.status, o.payment_status, o.created_at
       FROM orders o WHERE o.customer_id = $1 AND ${countedSql('o')}
      ORDER BY o.created_at DESC LIMIT 5`,
    [customerId],
  );
  const recentText = recent.length
    ? recent.map((o) => `    - #${o.id} ${new Date(o.created_at).toLocaleDateString('es-CL')} ${formatPrice(o.total)} [${o.status}/${o.payment_status}]`).join('\n')
    : '    (sin pedidos contables)';
  return [
    `CLIENTE ${c.name} <${c.email || 'N/D'}> (datos reales):`,
    `  Pedidos: ${c.total_orders} (pend ${c.pending_orders} · conf ${c.confirmed_orders})`,
    `  Total en pedidos: ${formatPrice(c.total_spent)} | Confirmado: ${formatPrice(c.confirmed_spent)}`,
    `  Últimos pedidos:`,
    recentText,
  ].join('\n');
}

async function periodBlock(period) {
  const { from, to, label } = period;
  const params = [from.toISOString(), to.toISOString()];
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE ${countedSql('o')})   AS orders,
            COUNT(*) FILTER (WHERE ${confirmedSql('o')}) AS confirmed_orders,
            COALESCE(SUM(total) FILTER (WHERE ${countedSql('o')}), 0)   AS revenue,
            COALESCE(SUM(total) FILTER (WHERE ${confirmedSql('o')}), 0) AS confirmed_revenue
       FROM orders o
      WHERE o.created_at >= $1 AND o.created_at < $2`,
    params,
  );
  const s = rows[0];
  const { rows: top } = await query(
    `SELECT p.name, SUM(oi.quantity) AS qty, SUM(oi.subtotal) AS rev
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
      WHERE ${countedSql('o')} AND o.created_at >= $1 AND o.created_at < $2
      GROUP BY p.id, p.name ORDER BY qty DESC LIMIT 5`,
    params,
  );
  const topText = top.length
    ? top.map((t) => `    - ${t.name}: ${t.qty} uds, ${formatPrice(t.rev)}`).join('\n')
    : '    (sin ventas en el período)';
  return [
    `VENTAS EN PERÍODO "${label}" (datos reales, pedidos no cancelados):`,
    `  Pedidos: ${s.orders} (confirmados ${s.confirmed_orders})`,
    `  Ingreso en pedidos: ${formatPrice(s.revenue)} | Confirmado: ${formatPrice(s.confirmed_revenue)}`,
    `  Top productos del período:`,
    topText,
  ].join('\n');
}

// Orquesta la detección + queries. Devuelve un bloque de texto para inyectar al
// system prompt, o '' si el mensaje no menciona entidades concretas.
async function buildRetrievedContext(message, customers = [], now = new Date()) {
  const blocks = [];

  const orderId = extractOrderId(message);
  if (orderId != null) {
    try { blocks.push(await orderBlock(orderId)); } catch { /* no romper el chat por retrieval */ }
  }

  const customerIds = matchCustomerIds(message, customers);
  for (const id of customerIds) {
    try {
      const b = await customerBlock(id);
      if (b) blocks.push(b);
    } catch { /* ignore */ }
  }

  const period = detectPeriod(message, now);
  if (period) {
    try { blocks.push(await periodBlock(period)); } catch { /* ignore */ }
  }

  if (!blocks.length) return '';
  return `\nDATOS ESPECÍFICOS RECUPERADOS PARA ESTA PREGUNTA (úsalos con prioridad sobre el resumen general):\n\n${blocks.join('\n\n')}\n`;
}

module.exports = {
  extractOrderId,
  detectPeriod,
  matchCustomerIds,
  buildRetrievedContext,
};
