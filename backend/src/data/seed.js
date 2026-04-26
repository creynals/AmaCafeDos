require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { query, initSchema, closeDatabase } = require('../models/database');

async function seed() {
  // Ensure schema exists
  await initSchema();

  // Clear existing data
  await query('DELETE FROM order_items');
  await query('DELETE FROM orders');
  await query('DELETE FROM cart_items');
  await query('DELETE FROM carts');
  await query('DELETE FROM product_options');
  await query('DELETE FROM products');
  await query('DELETE FROM categories');
  await query('DELETE FROM customers');

  // Insert categories
  const categories = [
    ['caffe', 'Caffè', 'Cafés calientes preparados con granos de especialidad', 1],
    ['iced', 'Iced Drinks', 'Bebidas frías y refrescantes', 2],
    ['te_infusiones', 'Té e Infusiones', 'Tés, matcha e infusiones', 3],
    ['helados', 'Helados', 'Copas de helado artesanal', 4],
    ['panaderia', 'Panadería', 'Croissants, pan de chocolate y más', 5],
    ['preparaciones_frias', 'Preparaciones Frías', 'Cake mix y preparaciones especiales', 6],
    ['bebidas', 'Bebidas', 'Jugos, granizados y agua', 7],
    ['cafe_grano', 'Café en Grano', 'Café de especialidad para llevar', 8],
  ];

  const categoryIds = {};
  for (const [name, display_name, description, sort_order] of categories) {
    const { rows } = await query(
      'INSERT INTO categories (name, display_name, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, display_name, description, sort_order]
    );
    categoryIds[name] = rows[0].id;
  }

  // Insert products with stock
  const products = [
    // Caffè
    [categoryIds.caffe, 'Espresso', 'Shot de café de especialidad, 30 ml de agua presurizada', 2500, '/images/products/espresso.jpg', 120, 1],
    [categoryIds.caffe, 'Espresso Doble', 'Doble carga de espresso', 3500, '/images/products/espresso.jpg', 80, 2],
    [categoryIds.caffe, 'Ristretto', 'Carga de espresso concentrado, 15 ml', 2500, '/images/products/espresso.jpg', 50, 3],
    [categoryIds.caffe, 'Lungo', 'Espresso largo, 60 ml de agua presurizada', 2500, '/images/products/americano.jpg', 60, 4],
    [categoryIds.caffe, 'Americano', 'Espresso con carga de agua', 2500, '/images/products/americano.jpg', 100, 5],
    [categoryIds.caffe, 'Americano Doble', 'Doble espresso con carga de agua', 3500, '/images/products/americano.jpg', 70, 6],
    [categoryIds.caffe, 'Macchiato', 'Espresso manchado con espuma de leche', 2500, '/images/products/macchiato.jpg', 60, 7],
    [categoryIds.caffe, 'Macchiato Doble', 'Doble espresso manchado con espuma de leche', 3500, '/images/products/macchiato.jpg', 40, 8],
    [categoryIds.caffe, 'Cappuccino', 'Espresso, leche texturizada y espuma con toque de canela o cacao', 3500, '/images/products/cappuccino.jpg', 90, 9],
    [categoryIds.caffe, 'Cappuccino Doble', 'Doble espresso con leche texturizada y espuma', 4000, '/images/products/cappuccino.jpg', 50, 10],
    [categoryIds.caffe, 'Cappuccino con Esencias', 'Cappuccino con un toque de esencia a elección', 3500, '/images/products/cappuccino.jpg', 40, 11],
    [categoryIds.caffe, 'Latte', 'Espresso, leche texturizada suavemente', 3500, '/images/products/latte.jpg', 85, 12],
    [categoryIds.caffe, 'Latte Doble', 'Doble espresso, leche texturizada suavemente', 4500, '/images/products/latte.jpg', 45, 13],
    [categoryIds.caffe, 'Allgretto', 'Espresso con leche texturizada y crema', 4500, '/images/products/specialty.jpg', 30, 14],
    [categoryIds.caffe, 'Vianés', 'Espresso con crema batida', 3500, '/images/products/vienes.jpg', 35, 15],
    [categoryIds.caffe, 'Café Massa Cardo', 'Café especial con cacao amarillo y frambuesa deshidratada', 3500, '/images/products/specialty.jpg', 25, 16],
    [categoryIds.caffe, 'Café Massa Mahir', 'Café especial con amaretti, canela y cardamomo', 3500, '/images/products/specialty.jpg', 25, 17],

    // Iced Drinks
    [categoryIds.iced, 'Iced Coffee', 'Shot de café + hielo + agua', 3000, '/images/products/iced-coffee.jpg', 70, 1],
    [categoryIds.iced, 'Iced Cold Brew', 'Shot cold brew + hielo + agua', 3500, '/images/products/iced-coffee.jpg', 50, 2],
    [categoryIds.iced, 'Iced Cold Brew Tonic/Ginger', 'Shot cold brew + agua tónica o ginger', 4500, '/images/products/iced-tonic.jpg', 35, 3],
    [categoryIds.iced, 'Iced Té Chai', 'Té chai + hielo + agua', 3500, '/images/products/chai.jpg', 40, 4],
    [categoryIds.iced, 'Iced Té Chai Orange', 'Té chai + hielo + jugo de naranja', 4000, '/images/products/chai.jpg', 30, 5],
    [categoryIds.iced, 'Iced Té Matcha', 'Shot de matcha + hielo + agua', 3500, '/images/products/iced-matcha.jpg', 40, 6],
    [categoryIds.iced, 'Iced Matcha Coffee', 'Shot de matcha + shot de café + hielo + agua', 4500, '/images/products/iced-matcha.jpg', 25, 7],

    // Té e Infusiones
    [categoryIds.te_infusiones, 'Té e Infusiones', 'Variedad de tés e infusiones', 2000, '/images/products/tea.jpg', 60, 1],
    [categoryIds.te_infusiones, 'Té Matcha', 'Té matcha ceremonial', 3500, '/images/products/matcha.jpg', 35, 2],
    [categoryIds.te_infusiones, 'Matcha Latte', 'Matcha con leche texturizada', 4000, '/images/products/matcha.jpg', 40, 3],
    [categoryIds.te_infusiones, 'Iced Matcha Latte', 'Matcha con leche texturizada y hielo', 4500, '/images/products/iced-matcha.jpg', 30, 4],
    [categoryIds.te_infusiones, 'Té Chai Latte', 'Té chai con leche texturizada', 3500, '/images/products/chai.jpg', 35, 5],

    // Helados
    [categoryIds.helados, 'Copa AMA Mini', 'Copa pequeña de helado artesanal, variedad de sabores', 5500, '/images/products/ice-cream.jpg', 40, 1],
    [categoryIds.helados, 'Copa AMA', 'Copa grande de helado con waffle, galletas y crema', 8500, '/images/products/ice-cream.jpg', 25, 2],

    // Panadería
    [categoryIds.panaderia, 'Croissant', 'Croissant artesanal de mantequilla', 2500, '/images/products/croissant.jpg', 50, 1],
    [categoryIds.panaderia, 'Pan de Chocolate', 'Pan artesanal con chocolate', 2500, '/images/products/pain-chocolat.jpg', 40, 2],
    [categoryIds.panaderia, 'Croissant Chocolate', 'Croissant relleno de chocolate', 2500, '/images/products/pain-chocolat.jpg', 35, 3],
    [categoryIds.panaderia, 'Croissant Almendra', 'Croissant con almendras', 2500, '/images/products/croissant.jpg', 30, 4],
    [categoryIds.panaderia, 'Rol de Canela', 'Rol de canela artesanal', 2500, '/images/products/cinnamon-roll.jpg', 30, 5],

    // Preparaciones Frías
    [categoryIds.preparaciones_frias, 'Cake Mix', 'Mezcla de torta, brownie, cheesecake de fruta y helado', 3000, '/images/products/cake.jpg', 20, 1],

    // Bebidas
    [categoryIds.bebidas, 'Jugo de Frutas', 'Jugo natural de frutas de temporada', 3500, '/images/products/juice.jpg', 45, 1],
    [categoryIds.bebidas, 'Granizado', 'Granizado de frutas', 3500, '/images/products/juice.jpg', 35, 2],
    [categoryIds.bebidas, 'Agua Mineral', 'Agua mineral natural', 1000, '/images/products/water.jpg', 200, 3],
    [categoryIds.bebidas, 'Agua Mineral Grande', 'Agua mineral grande', 4500, '/images/products/water.jpg', 80, 4],

    // Café en Grano
    [categoryIds.cafe_grano, 'Brasil Fazenda Furnas', 'Café de especialidad, origen Brasil, Finca Fazenda Furnas', 8500, '/images/products/coffee-beans.jpg', 15, 1],
    [categoryIds.cafe_grano, 'Brasil Microlote', 'Café de especialidad microlote, origen Brasil, 85 puntos', 9500, '/images/products/coffee-beans.jpg', 10, 2],
    [categoryIds.cafe_grano, 'Colombia', 'Café de especialidad, origen Colombia, variedad Castillo/Caturra', 8500, '/images/products/coffee-beans.jpg', 12, 3],
  ];

  const productIds = [];
  for (const [category_id, name, description, price, image_url, stock, sort_order] of products) {
    const { rows } = await query(
      'INSERT INTO products (category_id, name, description, price, image_url, stock, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [category_id, name, description, price, image_url, stock, sort_order]
    );
    productIds.push(rows[0].id);
  }

  // Insert common product options (adicionales)
  const { rows: coffeeProducts } = await query(
    'SELECT id FROM products WHERE category_id IN ($1, $2)',
    [categoryIds.caffe, categoryIds.iced]
  );

  const adicionales = [
    ['Leche de almendras', 500],
    ['Salsa de chocolate', 500],
    ['Caramelo', 500],
    ['Nutella', 500],
    ['Leche condensada', 500],
    ['Frutilla', 500],
  ];

  for (const product of coffeeProducts) {
    for (const [name, price] of adicionales) {
      await query(
        'INSERT INTO product_options (product_id, name, price_addition) VALUES ($1, $2, $3)',
        [product.id, name, price]
      );
    }
  }

  // =============================================
  // SEED: Customers
  // =============================================
  const customers = [
    ['María González', 'maria.gonzalez@gmail.com', '+56912345678', '2025-11-15 10:30:00'],
    ['Pedro Soto', 'pedro.soto@outlook.com', '+56923456789', '2025-11-20 14:15:00'],
    ['Camila Fernández', 'camila.fern@gmail.com', '+56934567890', '2025-12-01 09:00:00'],
    ['Andrés Muñoz', 'andres.munoz@yahoo.com', '+56945678901', '2025-12-05 16:45:00'],
    ['Valentina Rojas', 'vale.rojas@hotmail.com', '+56956789012', '2025-12-10 11:20:00'],
    ['Sebastián Torres', 'seba.torres@gmail.com', '+56967890123', '2025-12-15 08:30:00'],
    ['Francisca López', 'fran.lopez@gmail.com', '+56978901234', '2025-12-20 13:00:00'],
    ['Matías Herrera', 'matias.h@outlook.com', '+56989012345', '2026-01-05 10:00:00'],
    ['Catalina Díaz', 'cata.diaz@gmail.com', '+56990123456', '2026-01-10 15:30:00'],
    ['Nicolás Vargas', 'nico.vargas@gmail.com', '+56901234567', '2026-01-15 09:45:00'],
    ['Isidora Contreras', 'isi.contreras@yahoo.com', '+56911112222', '2026-01-20 12:00:00'],
    ['Tomás Ramírez', 'tomas.ramirez@gmail.com', '+56922223333', '2026-01-25 14:30:00'],
    ['Antonia Silva', 'antonia.silva@hotmail.com', '+56933334444', '2026-02-01 08:15:00'],
    ['Felipe Morales', 'felipe.m@gmail.com', '+56944445555', '2026-02-10 16:00:00'],
    ['Josefa Castillo', 'josefa.c@outlook.com', '+56955556666', '2026-02-15 11:45:00'],
    ['Benjamín Pizarro', 'benja.pizarro@gmail.com', '+56966667777', '2026-02-20 09:30:00'],
    ['Amanda Reyes', 'amanda.reyes@gmail.com', '+56977778888', '2026-02-25 13:15:00'],
    ['Diego Fuentes', 'diego.fuentes@yahoo.com', '+56988889999', '2026-03-01 10:45:00'],
    ['Renata Guzmán', 'renata.g@hotmail.com', '+56999990000', '2026-03-05 15:00:00'],
    ['Joaquín Espinoza', 'joaquin.e@gmail.com', '+56900001111', '2026-03-10 08:00:00'],
  ];

  const customerIds = [];
  for (const [name, email, phone, created_at] of customers) {
    const { rows } = await query(
      'INSERT INTO customers (name, email, phone, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, phone, created_at]
    );
    customerIds.push(rows[0].id);
  }

  // =============================================
  // SEED: Orders with realistic sales data
  // =============================================

  // Get all product info for building orders
  const { rows: allProducts } = await query('SELECT id, name, price FROM products');
  const productMap = {};
  for (const p of allProducts) {
    productMap[p.id] = p;
  }

  const communes = ['Providencia', 'Las Condes', 'Ñuñoa', 'Santiago Centro', 'Vitacura', 'La Reina'];
  const streets = ['Av. Providencia', 'Los Leones', 'Av. Apoquindo', 'Av. Italia', 'Av. Vitacura', 'Tobalaba'];
  const paymentMethods = ['efectivo', 'debito', 'credito', 'transferencia'];

  // Helper: pseudo-random using a seed for reproducibility
  let rngSeed = 42;
  function rng() {
    rngSeed = (rngSeed * 1103515245 + 12345) & 0x7fffffff;
    return rngSeed / 0x7fffffff;
  }

  function pickRandom(arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  const customerOrderCounts = [
    18, 14, 12, 9, 15, 7, 11, 5, 13, 6, 8, 4, 10, 3, 7, 5, 9, 2, 6, 3,
  ];

  const popularProducts = [0,1,4,5,8,9,11,12,17,18,20,25,26,28,31,32,36,37,40];
  const premiumProducts = [13,19,22,29,30,40,41,42];

  const startDate = new Date('2025-12-01');
  const endDate = new Date('2026-03-25');

  for (let ci = 0; ci < customerIds.length; ci++) {
    const customerId = customerIds[ci];
    const orderCount = customerOrderCounts[ci];
    const customer = customers[ci];

    for (let oi = 0; oi < orderCount; oi++) {
      const dayRange = (endDate - startDate) / (1000 * 60 * 60 * 24);
      const orderDay = Math.floor(rng() * dayRange);
      const orderDate = new Date(startDate);
      orderDate.setDate(orderDate.getDate() + orderDay);
      const hour = 8 + Math.floor(rng() * 12);
      const minute = Math.floor(rng() * 60);
      orderDate.setHours(hour, minute, 0, 0);
      const dateStr = orderDate.toISOString().replace('T', ' ').substring(0, 19);

      const r = rng();
      const itemCount = r < 0.15 ? 1 : r < 0.55 ? 2 : r < 0.85 ? 3 : 4;

      const orderProductIndices = new Set();
      for (let ii = 0; ii < itemCount; ii++) {
        const usePopular = rng() < 0.7;
        if (usePopular) {
          orderProductIndices.add(pickRandom(popularProducts));
        } else {
          orderProductIndices.add(Math.floor(rng() * products.length));
        }
      }

      if (ci < 5 && rng() < 0.3) {
        orderProductIndices.add(pickRandom(premiumProducts));
      }

      let subtotal = 0;
      const items = [];
      for (const pi of orderProductIndices) {
        const pid = productIds[pi];
        const product = productMap[pid];
        if (!product) continue;
        const qty = rng() < 0.3 ? 2 : 1;
        const itemSubtotal = product.price * qty;
        subtotal += itemSubtotal;
        items.push({ product_id: pid, name: product.name, price: product.price, quantity: qty, subtotal: itemSubtotal });
      }

      if (items.length === 0) continue;

      const commune = pickRandom(communes);
      const street = pickRandom(streets);
      const streetNum = String(100 + Math.floor(rng() * 9900));
      const payment = pickRandom(paymentMethods);
      const status = rng() < 0.9 ? 'completed' : 'pending';

      const { rows: orderRows } = await query(`
        INSERT INTO orders (customer_id, cart_id, status, contact_name, contact_email, contact_phone,
          address_street, address_number, address_commune, address_city, address_notes,
          payment_method, subtotal, total, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id
      `, [
        customerId, null, status, customer[0], customer[1], customer[2],
        street, streetNum, commune, 'Santiago', null,
        payment, subtotal, subtotal, dateStr
      ]);

      const orderId = orderRows[0].id;
      for (const item of items) {
        await query(`
          INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [orderId, item.product_id, item.name, item.price, item.quantity, item.subtotal, null]);
      }
    }
  }

  // Count totals for logging
  const totalOrders = (await query('SELECT COUNT(*) as c FROM orders')).rows[0].c;
  const totalItems = (await query('SELECT COUNT(*) as c FROM order_items')).rows[0].c;

  console.log('Database seeded successfully!');
  console.log(`  - ${categories.length} categories`);
  console.log(`  - ${products.length} products (with stock levels)`);
  console.log(`  - ${coffeeProducts.length * adicionales.length} product options`);
  console.log(`  - ${customers.length} customers`);
  console.log(`  - ${totalOrders} orders`);
  console.log(`  - ${totalItems} order items`);

  await closeDatabase();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
