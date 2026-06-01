const express = require('express');
const { query } = require('../models/database');
const { chatCompletion, getApiKey } = require('../utils/openrouter');

const router = express.Router();

const INVENTORY_LIMIT = 15;
const CUSTOMERS_LIMIT = 8;

function buildAdminSystemPrompt(salesData) {
  const { inventory, bestSellers, byCategory, byPayment, recentTrend, orders, customers, topByRevenue, topByFrequency, leastActive } = salesData;

  const inventoryShown = inventory.slice(0, INVENTORY_LIMIT);
  const inventoryHidden = Math.max(0, inventory.length - INVENTORY_LIMIT);
  const inventoryText = inventoryShown
    .map(p => `  - ${p.name} (${p.category}): $${Number(p.price).toLocaleString('es-CL')} | Vendidos: ${p.total_sold} | Ingreso: $${Number(p.total_revenue).toLocaleString('es-CL')} | ${p.available ? 'Activo' : 'Inactivo'}`)
    .join('\n')
    + (inventoryHidden > 0 ? `\n  ...y ${inventoryHidden} producto(s) más con menor ingreso (no mostrados para optimizar contexto)` : '');

  const bestSellersText = bestSellers.length > 0
    ? bestSellers.map((p, i) => `  ${i + 1}. ${p.name}: ${p.total_sold} unidades, $${Number(p.total_revenue).toLocaleString('es-CL')}`).join('\n')
    : '  Sin datos de ventas aun';

  const categoryText = byCategory.length > 0
    ? byCategory.map(c => `  - ${c.category}: ${c.units_sold} unidades, $${Number(c.revenue).toLocaleString('es-CL')}, ${c.orders} pedidos`).join('\n')
    : '  Sin datos';

  const paymentText = byPayment.length > 0
    ? byPayment.map(p => `  - ${p.payment_method}: ${p.count} pedidos, $${Number(p.revenue).toLocaleString('es-CL')}`).join('\n')
    : '  Sin datos';

  const trendText = recentTrend.length > 0
    ? recentTrend.slice(0, 7).map(t => `  - ${t.date}: ${t.orders} pedidos, $${Number(t.revenue).toLocaleString('es-CL')}`).join('\n')
    : '  Sin datos de tendencia';

  const customersShown = customers.slice(0, CUSTOMERS_LIMIT);
  const customersHidden = Math.max(0, customers.length - CUSTOMERS_LIMIT);
  const customersText = customersShown.length > 0
    ? customersShown.map(c => `  - ${c.name} (${c.email}): ${c.total_orders} pedidos, $${Number(c.total_spent).toLocaleString('es-CL')} gastado, último pedido: ${c.last_order_date || 'Nunca'}`).join('\n')
      + (customersHidden > 0 ? `\n  ...y ${customersHidden} cliente(s) más con menor gasto (no mostrados para optimizar contexto)` : '')
    : '  Sin clientes registrados aun';

  return `Eres un asistente de inteligencia de negocios para AMA Café, una cafetería de especialidad chilena.
Tu rol es ayudar al administrador con análisis de datos, insights de ventas, sugerencias de campañas
y estrategia de negocio.

REGLAS:
- Responde siempre en español profesional pero cercano
- Basa tus respuestas en los datos reales proporcionados
- Sé específico con números y porcentajes
- Cuando sugieras campañas o estrategias, sé concreto y accionable
- Los precios están en pesos chilenos (CLP)
- Si no hay datos suficientes, indícalo y sugiere cómo empezar a recopilar información

DATOS ACTUALES DEL NEGOCIO:

INVENTARIO (top ${INVENTORY_LIMIT} por ingreso, total ${inventory.length} productos):
${inventoryText}

TOP PRODUCTOS MÁS VENDIDOS:
${bestSellersText}

VENTAS POR CATEGORÍA:
${categoryText}

MÉTODOS DE PAGO:
${paymentText}

TENDENCIA RECIENTE (últimos 7 días):
${trendText}

TOTAL PEDIDOS: ${orders}

CLIENTES REGISTRADOS (top ${CUSTOMERS_LIMIT} por gasto, total ${customers.length}):
${customersText}

TOP 5 CLIENTES POR INGRESO:
${topByRevenue.map((c, i) => `  ${i + 1}. ${c.name}: $${Number(c.total_spent).toLocaleString('es-CL')} en ${c.order_count} pedidos`).join('\n')}

TOP 5 CLIENTES POR FRECUENCIA:
${topByFrequency.map((c, i) => `  ${i + 1}. ${c.name}: ${c.order_count} pedidos, $${Number(c.total_spent).toLocaleString('es-CL')}`).join('\n')}

CLIENTES MENOS ACTIVOS (menos compras):
${leastActive.map((c, i) => `  ${i + 1}. ${c.name} (${c.email}): ${c.total_orders} pedido(s), $${Number(c.total_spent).toLocaleString('es-CL')}, último: ${c.last_order_date || 'Nunca'}`).join('\n')}

Usa estos datos para responder con insights precisos y recomendaciones basadas en evidencia.
Cuando te pregunten sobre clientes específicos, usa los datos reales de la base de datos.
Puedes sugerir campañas personalizadas usando los nombres y datos reales de los clientes.`;
}

router.post('/admin/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message es requerido' });
  }

  if (!(await getApiKey())) {
    return res.status(500).json({
      error: 'API key no configurada',
      reply: 'El chat de administración no está disponible. Configura la API key de OpenRouter desde la pestaña Configuración AI.',
    });
  }

  const { rows: inventory } = await query(`
    SELECT p.id, p.name, p.price, p.available,
           c.display_name as category,
           COALESCE(SUM(oi.quantity), 0) as total_sold,
           COALESCE(SUM(oi.subtotal), 0) as total_revenue
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    GROUP BY p.id, p.name, p.price, p.available, c.display_name
    ORDER BY total_revenue DESC
  `);

  const { rows: bestSellers } = await query(`
    SELECT p.name, SUM(oi.quantity) as total_sold, SUM(oi.subtotal) as total_revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    GROUP BY p.id, p.name ORDER BY total_sold DESC LIMIT 10
  `);

  const { rows: byCategory } = await query(`
    SELECT c.display_name as category, SUM(oi.quantity) as units_sold,
           SUM(oi.subtotal) as revenue, COUNT(DISTINCT oi.order_id) as orders
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    GROUP BY c.id, c.display_name ORDER BY revenue DESC
  `);

  const { rows: byPayment } = await query(`
    SELECT payment_method, COUNT(*) as count, SUM(total) as revenue
    FROM orders GROUP BY payment_method ORDER BY count DESC
  `);

  const { rows: recentTrend } = await query(`
    SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as revenue
    FROM orders GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7
  `);

  const totalOrders = (await query('SELECT COUNT(*) as count FROM orders')).rows[0].count;

  const { rows: customers } = await query(`
    SELECT c.id, c.name, c.email, c.phone, c.created_at,
           COUNT(DISTINCT o.id) as total_orders,
           COALESCE(SUM(o.total), 0) as total_spent,
           MAX(o.created_at) as last_order_date
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
    GROUP BY c.id, c.name, c.email, c.phone, c.created_at
    ORDER BY total_spent DESC
  `);

  const { rows: topByRevenue } = await query(`
    SELECT c.name, SUM(o.total) as total_spent, COUNT(o.id) as order_count
    FROM customers c
    JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
    GROUP BY c.id, c.name ORDER BY total_spent DESC LIMIT 5
  `);

  const { rows: topByFrequency } = await query(`
    SELECT c.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
    FROM customers c
    JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
    GROUP BY c.id, c.name ORDER BY order_count DESC LIMIT 5
  `);

  const { rows: leastActive } = await query(`
    SELECT c.name, c.email, COUNT(o.id) as total_orders,
           COALESCE(SUM(o.total), 0) as total_spent,
           MAX(o.created_at) as last_order_date
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
    GROUP BY c.id, c.name, c.email ORDER BY total_orders ASC, total_spent ASC LIMIT 5
  `);

  const systemPrompt = buildAdminSystemPrompt({
    inventory, bestSellers, byCategory, byPayment, recentTrend, orders: totalOrders,
    customers, topByRevenue, topByFrequency, leastActive,
  });

  const messages = [{ role: 'system', content: systemPrompt }];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-4)) {
      if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) continue;
      messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    const reply = await chatCompletion({ messages, maxTokens: 900, agent: 'admin' });
    res.json({ reply });
  } catch (err) {
    console.error('Admin chat error', {
      message: err.message,
      upstreamStatus: err.upstreamStatus,
      upstreamModel: err.upstreamModel,
      upstreamBody: err.upstreamBody ? String(err.upstreamBody).slice(0, 1000) : undefined,
      finishReason: err.finishReason,
      historyLen: Array.isArray(history) ? history.length : 0,
      stack: err.stack,
    });

    let detail = err.message;
    if (err.upstreamBody) {
      try {
        const parsed = JSON.parse(err.upstreamBody);
        detail = parsed?.error?.message || parsed?.message || err.upstreamBody.slice(0, 300);
      } catch {
        detail = err.upstreamBody.slice(0, 300);
      }
    }

    // Actionable UX message when token budget exhausted after escalation
    const userReply = err.finishReason === 'length'
      ? 'El modelo necesitó más tokens de los permitidos incluso tras reintentos. Sugerencia: haz una pregunta más corta o inicia una conversación nueva para liberar el contexto.'
      : `Hubo un error contactando al modelo${err.upstreamStatus ? ` (HTTP ${err.upstreamStatus})` : ''}: ${detail}`;

    res.status(502).json({
      error: 'Error al comunicarse con el asistente AI',
      reply: userReply,
      upstream: {
        status: err.upstreamStatus,
        model: err.upstreamModel,
        finishReason: err.finishReason,
        detail,
      },
    });
  }
});

module.exports = router;
