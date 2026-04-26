const express = require('express');
const { query } = require('../models/database');
const { chatCompletion, getApiKey } = require('../utils/openrouter');
const { chatInputSanitizer, chatRateLimiter, sanitizeResponse } = require('../middleware/security');
const { recaptchaMiddleware } = require('../utils/recaptcha');

const router = express.Router();

function buildSystemPrompt(products, cartContext) {
  const menuByCategory = {};
  for (const p of products) {
    if (!menuByCategory[p.category]) menuByCategory[p.category] = [];
    menuByCategory[p.category].push(p);
  }

  const menuText = Object.entries(menuByCategory)
    .map(([cat, items]) => {
      const list = items
        .map(p => `  - ${p.name}: $${p.price.toLocaleString('es-CL')} — ${p.description}`)
        .join('\n');
      return `${cat}:\n${list}`;
    })
    .join('\n\n');

  let cartText = '';
  if (cartContext && cartContext.items.length > 0) {
    const items = cartContext.items
      .map(i => `  - ${i.quantity}x ${i.name} ($${(i.price * i.quantity).toLocaleString('es-CL')})`)
      .join('\n');
    cartText = `\n\nCARRITO ACTUAL DEL CLIENTE:\n${items}\nTotal: $${cartContext.total.toLocaleString('es-CL')}`;
  }

  return `Eres el asistente virtual de AMA Café, una cafetería de especialidad chilena.
Tu rol es ayudar a los clientes a explorar el menú, hacer recomendaciones personalizadas,
responder preguntas sobre ingredientes y acompañar su experiencia de compra.

REGLAS:
- Responde siempre en español, de forma cálida y amigable
- Sé conciso (2-4 oraciones máximo por respuesta)
- Usa emojis con moderación (máximo 1-2 por respuesta)
- Cuando recomiendes productos, menciona el precio
- Si preguntan por algo que no está en el menú, sugiere alternativas
- No inventes productos que no estén en el menú
- Los precios están en pesos chilenos (CLP)

ADICIONALES DISPONIBLES (para cafés): Leche de almendras, Salsa de chocolate, Caramelo, Nutella, Leche condensada, Frutilla ($500 c/u)

MENÚ COMPLETO:
${menuText}${cartText}`;
}

router.post('/chat', chatRateLimiter, chatInputSanitizer, recaptchaMiddleware, async (req, res) => {
  const { message, cart_id, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message es requerido' });
  }

  if (!(await getApiKey())) {
    return res.status(500).json({
      error: 'API key no configurada',
      reply: 'Lo siento, el chat no está disponible en este momento. El administrador debe configurar la API key de OpenRouter desde el panel ADM.',
    });
  }

  const { rows: products } = await query(`
    SELECT p.name, p.description, p.price, c.display_name as category
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.available = 1
    ORDER BY c.sort_order, p.sort_order
  `);

  let cartContext = null;
  if (cart_id) {
    const { rows: cartItems } = await query(`
      SELECT p.name, ci.quantity, p.price
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = $1
    `, [cart_id]);

    if (cartItems.length > 0) {
      cartContext = {
        items: cartItems,
        total: cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
      };
    }
  }

  const systemPrompt = buildSystemPrompt(products, cartContext);

  const messages = [{ role: 'system', content: systemPrompt }];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    const rawReply = await chatCompletion({ messages, maxTokens: 300, agent: 'customer' });
    const reply = sanitizeResponse(rawReply);

    res.json({
      reply,
      context: {
        products_available: products.length,
        cart: cartContext,
      },
    });
  } catch (err) {
    console.error('OpenRouter API error:', err.message);
    res.status(500).json({
      error: 'Error al comunicarse con el asistente AI',
      reply: 'Lo siento, hubo un error al procesar tu mensaje. Intenta de nuevo en unos segundos.',
    });
  }
});

module.exports = router;
