const express = require('express');
const { query } = require('../models/database');

const router = express.Router();

// GET /api/categories - List all categories
router.get('/categories', async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, display_name, description, sort_order FROM categories ORDER BY sort_order'
  );
  res.json(rows);
});

// GET /api/products - List all products (with optional category filter)
router.get('/products', async (req, res) => {
  const { category, search } = req.query;

  let sql = `
    SELECT p.id, p.name, p.description, p.price, p.image_url, p.available,
           c.name as category_name, c.display_name as category_display_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.available = 1
  `;
  const params = [];
  let idx = 1;

  if (category) {
    sql += ` AND c.name = $${idx++}`;
    params.push(category);
  }

  if (search) {
    sql += ` AND (p.name ILIKE $${idx++} OR p.description ILIKE $${idx++})`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY c.sort_order, p.sort_order';

  const { rows } = await query(sql, params);
  res.json(rows);
});

// GET /api/products/:id - Get single product with options
router.get('/products/:id', async (req, res) => {
  const { rows: productRows } = await query(`
    SELECT p.id, p.name, p.description, p.price, p.image_url, p.available,
           c.name as category_name, c.display_name as category_display_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.id = $1
  `, [req.params.id]);

  const product = productRows[0];
  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  const { rows: options } = await query(
    'SELECT id, name, price_addition FROM product_options WHERE product_id = $1',
    [req.params.id]
  );

  res.json({ ...product, options });
});

// GET /api/menu - Full menu grouped by categories
router.get('/menu', async (req, res) => {
  const { rows: categories } = await query(
    'SELECT id, name, display_name, description FROM categories ORDER BY sort_order'
  );

  const menu = [];
  for (const category of categories) {
    const { rows: products } = await query(`
      SELECT id, name, description, price, image_url, available
      FROM products
      WHERE category_id = $1 AND available = 1
      ORDER BY sort_order
    `, [category.id]);

    const productsWithOptions = [];
    for (const product of products) {
      const { rows: options } = await query(
        'SELECT id, name, price_addition FROM product_options WHERE product_id = $1',
        [product.id]
      );
      productsWithOptions.push({ ...product, options: options.length > 0 ? options : undefined });
    }

    menu.push({ ...category, products: productsWithOptions });
  }

  res.json(menu);
});

module.exports = router;
