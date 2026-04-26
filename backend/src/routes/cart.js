const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../models/database');

const router = express.Router();

async function getCartResponse(cartId) {
  const { rows: cartRows } = await query('SELECT * FROM carts WHERE id = $1', [cartId]);
  const cart = cartRows[0];
  if (!cart) return null;

  const { rows: items } = await query(`
    SELECT ci.id as item_id, ci.quantity, ci.notes,
           p.id as product_id, p.name, p.description, p.price, p.image_url
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = $1
  `, [cartId]);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    cart_id: cart.id,
    items: items.map(item => ({
      item_id: item.item_id,
      product_id: item.product_id,
      name: item.name,
      description: item.description,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity,
      notes: item.notes,
      image_url: item.image_url,
    })),
    total,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

// POST /api/cart - Create a new cart
router.post('/cart', async (req, res) => {
  const cartId = uuidv4();
  await query('INSERT INTO carts (id) VALUES ($1)', [cartId]);
  res.status(201).json({ cart_id: cartId, items: [], total: 0 });
});

// GET /api/cart/:id - Get cart with items
router.get('/cart/:id', async (req, res) => {
  const cart = await getCartResponse(req.params.id);
  if (!cart) {
    return res.status(404).json({ error: 'Carrito no encontrado' });
  }
  res.json(cart);
});

// POST /api/cart/:id/items - Add item to cart
router.post('/cart/:id/items', async (req, res) => {
  const { product_id, quantity = 1, notes } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: 'product_id es requerido' });
  }

  const { rows: cartRows } = await query('SELECT * FROM carts WHERE id = $1', [req.params.id]);
  if (cartRows.length === 0) {
    return res.status(404).json({ error: 'Carrito no encontrado' });
  }

  const { rows: productRows } = await query('SELECT * FROM products WHERE id = $1 AND available = 1', [product_id]);
  if (productRows.length === 0) {
    return res.status(404).json({ error: 'Producto no encontrado o no disponible' });
  }

  // Check if product already in cart
  const { rows: existingRows } = await query(
    'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2',
    [req.params.id, product_id]
  );

  if (existingRows.length > 0) {
    await query(
      'UPDATE cart_items SET quantity = quantity + $1, notes = COALESCE($2, notes) WHERE id = $3',
      [quantity, notes || null, existingRows[0].id]
    );
  } else {
    await query(
      'INSERT INTO cart_items (cart_id, product_id, quantity, notes) VALUES ($1, $2, $3, $4)',
      [req.params.id, product_id, quantity, notes || null]
    );
  }

  await query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [req.params.id]);

  res.status(201).json(await getCartResponse(req.params.id));
});

// PUT /api/cart/:id/items/:itemId - Update cart item quantity
router.put('/cart/:id/items/:itemId', async (req, res) => {
  const { quantity, notes } = req.body;

  const { rows: itemRows } = await query(
    'SELECT * FROM cart_items WHERE id = $1 AND cart_id = $2',
    [req.params.itemId, req.params.id]
  );

  if (itemRows.length === 0) {
    return res.status(404).json({ error: 'Item no encontrado en el carrito' });
  }

  if (quantity !== undefined && quantity <= 0) {
    await query('DELETE FROM cart_items WHERE id = $1', [req.params.itemId]);
  } else {
    const updates = [];
    const params = [];
    let idx = 1;
    if (quantity !== undefined) { updates.push(`quantity = $${idx++}`); params.push(quantity); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }

    if (updates.length > 0) {
      params.push(req.params.itemId);
      await query(`UPDATE cart_items SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    }
  }

  await query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [req.params.id]);

  res.json(await getCartResponse(req.params.id));
});

// DELETE /api/cart/:id/items/:itemId - Remove item from cart
router.delete('/cart/:id/items/:itemId', async (req, res) => {
  const result = await query(
    'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2',
    [req.params.itemId, req.params.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Item no encontrado en el carrito' });
  }

  await query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [req.params.id]);

  res.json({ message: 'Item eliminado del carrito' });
});

// DELETE /api/cart/:id - Clear entire cart
router.delete('/cart/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM carts WHERE id = $1', [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Carrito no encontrado' });
  }

  await query('DELETE FROM cart_items WHERE cart_id = $1', [req.params.id]);
  await query('UPDATE carts SET updated_at = NOW() WHERE id = $1', [req.params.id]);

  res.json({ message: 'Carrito vaciado', cart_id: req.params.id });
});

module.exports = router;
