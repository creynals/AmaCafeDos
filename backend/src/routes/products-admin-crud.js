// Endpoints admin para CRUD individual de productos.
// Ciclo 9 SYNAPTIC — Mantenedor individual (decisiones C8 gap analysis):
//   - Crear/editar/eliminar/ajuste-stock individual
//   - Soft-delete (no borrado físico) en línea con bulk-import
//   - Auditoría granular: cada cambio registrado en products_audit
//   - SKU opcional, único entre vivos (delegado al UNIQUE INDEX parcial)
//   - Validación inline sin Zod (consistente con resto del proyecto)
//
// Importante: este archivo NO modifica los endpoints de bulk-import. Coexisten
// bajo el mismo prefix /admin/products gracias a que las rutas con slug literal
// (bulk-template, bulk-import, categories, upload-image) ya están definidas en
// products-admin.js (registrado antes en server.js).

const express = require('express');
const { query, getClient } = require('../models/database');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function toStrOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function badRequest(res, errors) {
  return res.status(400).json({
    error: 'Validación fallida',
    details: Array.isArray(errors) ? errors : [errors],
  });
}

async function logAudit(client, { productId, action, field, previousValue, newValue, changedBy, metadata }) {
  await client.query(
    `INSERT INTO products_audit
       (product_id, action, field, previous_value, new_value, changed_by, changed_by_username, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      productId,
      action,
      field ?? null,
      previousValue === null || previousValue === undefined ? null : String(previousValue),
      newValue === null || newValue === undefined ? null : String(newValue),
      changedBy.id,
      changedBy.username,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

function changedByFromReq(req) {
  return { id: req.authUser.user_id, username: req.authUser.username };
}

// Diff entre dos representaciones de producto para audit por campo.
const AUDITED_FIELDS = ['name', 'description', 'category_id', 'price', 'stock', 'available', 'sort_order', 'image_url', 'sku'];

function diffProducts(before, after) {
  const changes = [];
  for (const f of AUDITED_FIELDS) {
    const a = before[f];
    const b = after[f];
    if ((a ?? null) !== (b ?? null)) {
      changes.push({ field: f, previous: a, next: b });
    }
  }
  return changes;
}

// ─── GET /admin/products/list — listado admin ────────────────────────────────
//   ?include_deleted=1 → incluye soft-deleted (default: solo vivos)
//   ?category_id=N     → filtra por categoría
//   ?search=texto      → busca en name/sku
router.get('/admin/products/list', async (req, res) => {
  const includeDeleted = req.query.include_deleted === '1' || req.query.include_deleted === 'true';
  const categoryId = toIntOrNull(req.query.category_id);
  const search = toStrOrNull(req.query.search);

  const where = [];
  const params = [];
  let i = 1;

  if (!includeDeleted) {
    where.push('p.deleted_at IS NULL');
  }
  if (Number.isInteger(categoryId)) {
    where.push(`p.category_id = $${i++}`);
    params.push(categoryId);
  }
  if (search) {
    where.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT
        p.id, p.category_id, c.name AS category_name, c.display_name AS category_display_name,
        p.name, p.description, p.price, p.image_url, p.available, p.stock, p.sort_order,
        p.sku, p.deleted_at, p.created_at
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ${whereSql}
     ORDER BY p.sort_order ASC, p.name ASC`,
    params
  );

  res.json(rows);
});

// ─── GET /admin/products/:id — detalle ───────────────────────────────────────
router.get('/admin/products/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await query(
    `SELECT
        p.id, p.category_id, c.name AS category_name, c.display_name AS category_display_name,
        p.name, p.description, p.price, p.image_url, p.available, p.stock, p.sort_order,
        p.sku, p.deleted_at, p.created_at
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1`,
    [id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  res.json(rows[0]);
});

// ─── POST /admin/products — crear ────────────────────────────────────────────
router.post('/admin/products', async (req, res) => {
  const errors = [];
  const name = toStrOrNull(req.body.name);
  const description = toStrOrNull(req.body.description);
  const categoryId = toIntOrNull(req.body.category_id);
  const price = toIntOrNull(req.body.price);
  const stock = toIntOrNull(req.body.stock);
  const available = toIntOrNull(req.body.available);
  const sortOrder = toIntOrNull(req.body.sort_order);
  const imageUrl = toStrOrNull(req.body.image_url);
  const sku = toStrOrNull(req.body.sku);

  if (!name) errors.push('name es requerido');
  if (!Number.isInteger(categoryId) || categoryId === null) errors.push('category_id es requerido (entero)');
  if (price === null || !Number.isInteger(price) || price < 0) errors.push('price es requerido (entero >= 0)');
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) errors.push('stock debe ser entero >= 0');
  if (available !== null && available !== 0 && available !== 1) errors.push('available debe ser 0 o 1');
  if (sortOrder !== null && !Number.isInteger(sortOrder)) errors.push('sort_order debe ser entero');
  if (errors.length) return badRequest(res, errors);

  // Verificar categoría existe
  const cat = await query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (cat.rows.length === 0) {
    return badRequest(res, [`category_id ${categoryId} no existe`]);
  }

  // Verificar SKU único entre vivos (consulta explícita para mensaje claro)
  if (sku) {
    const dup = await query(
      'SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL',
      [sku]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `SKU "${sku}" ya existe entre productos activos` });
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO products
         (category_id, name, description, price, stock, available, sort_order, image_url, sku)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        categoryId, name, description, price,
        stock ?? 0, available ?? 1, sortOrder ?? 0,
        imageUrl, sku,
      ]
    );
    const product = result.rows[0];

    await logAudit(client, {
      productId: product.id,
      action: 'create',
      changedBy: changedByFromReq(req),
      metadata: {
        snapshot: {
          name: product.name,
          category_id: product.category_id,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
        },
      },
    });

    await client.query('COMMIT');
    res.status(201).json(product);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'SKU duplicado entre productos activos' });
    }
    console.error('[products-admin-crud] create ERROR:', err.message);
    res.status(500).json({ error: 'Error al crear producto', detail: err.message });
  } finally {
    client.release();
  }
});

// ─── PUT /admin/products/:id — actualizar ────────────────────────────────────
router.put('/admin/products/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT * FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (before.rows[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No se puede editar un producto eliminado. Restaurelo primero.' });
    }

    // Aceptamos updates parciales: solo campos presentes en el body se actualizan.
    const errors = [];
    const updates = {};

    if ('name' in req.body) {
      const v = toStrOrNull(req.body.name);
      if (!v) errors.push('name no puede ser vacío');
      else updates.name = v;
    }
    if ('description' in req.body) {
      updates.description = toStrOrNull(req.body.description);
    }
    if ('category_id' in req.body) {
      const v = toIntOrNull(req.body.category_id);
      if (!Number.isInteger(v)) errors.push('category_id debe ser entero');
      else updates.category_id = v;
    }
    if ('price' in req.body) {
      const v = toIntOrNull(req.body.price);
      if (!Number.isInteger(v) || v < 0) errors.push('price debe ser entero >= 0');
      else updates.price = v;
    }
    if ('stock' in req.body) {
      const v = toIntOrNull(req.body.stock);
      if (!Number.isInteger(v) || v < 0) errors.push('stock debe ser entero >= 0');
      else updates.stock = v;
    }
    if ('available' in req.body) {
      const v = toIntOrNull(req.body.available);
      if (v !== 0 && v !== 1) errors.push('available debe ser 0 o 1');
      else updates.available = v;
    }
    if ('sort_order' in req.body) {
      const v = toIntOrNull(req.body.sort_order);
      if (!Number.isInteger(v)) errors.push('sort_order debe ser entero');
      else updates.sort_order = v;
    }
    if ('image_url' in req.body) {
      updates.image_url = toStrOrNull(req.body.image_url);
    }
    if ('sku' in req.body) {
      updates.sku = toStrOrNull(req.body.sku);
    }

    if (errors.length) {
      await client.query('ROLLBACK');
      return badRequest(res, errors);
    }
    if (Object.keys(updates).length === 0) {
      await client.query('ROLLBACK');
      return badRequest(res, ['No hay campos para actualizar']);
    }

    if ('category_id' in updates) {
      const cat = await client.query('SELECT id FROM categories WHERE id = $1', [updates.category_id]);
      if (cat.rows.length === 0) {
        await client.query('ROLLBACK');
        return badRequest(res, [`category_id ${updates.category_id} no existe`]);
      }
    }
    if ('sku' in updates && updates.sku) {
      const dup = await client.query(
        'SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL AND id <> $2',
        [updates.sku, id]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `SKU "${updates.sku}" ya existe entre productos activos` });
      }
    }

    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
    values.push(id);

    const result = await client.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    const after = result.rows[0];

    const changes = diffProducts(before.rows[0], after);
    const changedBy = changedByFromReq(req);
    for (const c of changes) {
      await logAudit(client, {
        productId: id,
        action: 'update',
        field: c.field,
        previousValue: c.previous,
        newValue: c.next,
        changedBy,
      });
    }

    await client.query('COMMIT');
    res.json(after);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'SKU duplicado entre productos activos' });
    }
    console.error('[products-admin-crud] update ERROR:', err.message);
    res.status(500).json({ error: 'Error al actualizar producto', detail: err.message });
  } finally {
    client.release();
  }
});

// ─── PATCH /admin/products/:id/stock — ajuste rápido de stock ────────────────
//   body: { stock?: int (set absoluto) | delta?: int (incremento), reason?: string }
router.patch('/admin/products/:id(\\d+)/stock', async (req, res) => {
  const id = Number(req.params.id);
  const stockAbsolute = toIntOrNull(req.body.stock);
  const delta = toIntOrNull(req.body.delta);
  const reason = toStrOrNull(req.body.reason);

  if (stockAbsolute === null && delta === null) {
    return badRequest(res, ['Debe proveer "stock" (valor absoluto) o "delta" (incremento)']);
  }
  if (stockAbsolute !== null && delta !== null) {
    return badRequest(res, ['Provea solo uno: "stock" o "delta", no ambos']);
  }
  if (stockAbsolute !== null && (!Number.isInteger(stockAbsolute) || stockAbsolute < 0)) {
    return badRequest(res, ['stock debe ser entero >= 0']);
  }
  if (delta !== null && !Number.isInteger(delta)) {
    return badRequest(res, ['delta debe ser entero']);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT id, stock, deleted_at FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (before.rows[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No se puede ajustar stock de producto eliminado' });
    }

    const previousStock = before.rows[0].stock;
    const newStock = stockAbsolute !== null ? stockAbsolute : previousStock + delta;
    if (newStock < 0) {
      await client.query('ROLLBACK');
      return badRequest(res, [`Stock resultante negativo (${newStock})`]);
    }

    const result = await client.query(
      'UPDATE products SET stock = $1 WHERE id = $2 RETURNING *',
      [newStock, id]
    );

    await logAudit(client, {
      productId: id,
      action: 'stock_adjust',
      field: 'stock',
      previousValue: previousStock,
      newValue: newStock,
      changedBy: changedByFromReq(req),
      metadata: {
        delta: newStock - previousStock,
        mode: stockAbsolute !== null ? 'absolute' : 'delta',
        reason: reason || null,
      },
    });

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[products-admin-crud] stock-adjust ERROR:', err.message);
    res.status(500).json({ error: 'Error al ajustar stock', detail: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /admin/products/:id — soft-delete ────────────────────────────────
router.delete('/admin/products/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  const reason = toStrOrNull(req.body?.reason);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT id, name, deleted_at FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (before.rows[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Producto ya estaba eliminado' });
    }

    const result = await client.query(
      'UPDATE products SET deleted_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    await logAudit(client, {
      productId: id,
      action: 'soft_delete',
      changedBy: changedByFromReq(req),
      metadata: { name: before.rows[0].name, reason: reason || null },
    });

    await client.query('COMMIT');
    res.json({ ok: true, product: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[products-admin-crud] delete ERROR:', err.message);
    res.status(500).json({ error: 'Error al eliminar producto', detail: err.message });
  } finally {
    client.release();
  }
});

// ─── POST /admin/products/:id/restore — restaurar soft-deleted ───────────────
router.post('/admin/products/:id(\\d+)/restore', async (req, res) => {
  const id = Number(req.params.id);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT id, sku, deleted_at FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (!before.rows[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El producto no está eliminado' });
    }

    // Si tiene SKU, validar que no haya colisión con otro vivo
    if (before.rows[0].sku) {
      const dup = await client.query(
        'SELECT id FROM products WHERE sku = $1 AND deleted_at IS NULL AND id <> $2',
        [before.rows[0].sku, id]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `No se puede restaurar: SKU "${before.rows[0].sku}" ya está en uso por otro producto activo`,
        });
      }
    }

    const result = await client.query(
      'UPDATE products SET deleted_at = NULL WHERE id = $1 RETURNING *',
      [id]
    );

    await logAudit(client, {
      productId: id,
      action: 'restore',
      changedBy: changedByFromReq(req),
    });

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[products-admin-crud] restore ERROR:', err.message);
    res.status(500).json({ error: 'Error al restaurar producto', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
