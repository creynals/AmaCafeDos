// Endpoints admin para galería de imágenes por producto.
// Ciclo 10 SYNAPTIC — Multi-imagen (gap C9 deferred):
//   - Subir múltiples imágenes por producto (multer disk → /fuentes/products/)
//   - Listar / reordenar / marcar primaria / eliminar (con cleanup de archivo)
//   - Auditoría: cada cambio relevante registrado en products_audit
//
// Diseño:
//   - Tabla product_images creada en migración 012 (1:N, ON DELETE CASCADE).
//   - Backward-compatible con products.image_url: cuando se marca una imagen
//     como is_primary=TRUE, ADEMÁS sincronizamos products.image_url para que
//     el storefront legacy siga funcionando sin cambios.
//   - Si se elimina la última imagen primaria, fallback: ascendemos otra (la
//     siguiente por sort_order) a primaria.
//
// Coexiste con products-admin.js (bulk + upload-image legacy) y
// products-admin-crud.js (CRUD individual). NO modifica esos archivos.

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const { query, getClient } = require('../models/database');
const { uploadImageRateLimiter } = require('../middleware/security');
const { IMAGES_DIR, ensureImagesDir } = require('../utils/imageStorage');

const router = express.Router();

// ─── Multer (mismo pipeline que products-admin.js para imágenes) ─────────────
// IMAGES_DIR comes from utils/imageStorage so local dev (fuentes/products) and
// Railway production (volume mount via IMAGES_STORAGE_PATH) stay aligned.

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureImagesDir();
      cb(null, IMAGES_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}_${safe}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname);
    if (!ok) return cb(new Error('Imagen debe ser .jpg/.jpeg/.png/.webp/.gif'));
    cb(null, true);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function changedByFromReq(req) {
  return { id: req.authUser.user_id, username: req.authUser.username };
}

async function logAudit(client, { productId, field, previousValue, newValue, changedBy, metadata }) {
  await client.query(
    `INSERT INTO products_audit
       (product_id, action, field, previous_value, new_value, changed_by, changed_by_username, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      productId,
      'update',
      field,
      previousValue === null || previousValue === undefined ? null : String(previousValue),
      newValue === null || newValue === undefined ? null : String(newValue),
      changedBy.id,
      changedBy.username,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

// Sincroniza products.image_url con la imagen primaria actual del producto.
// Si no hay imagen primaria, deja el image_url existente (legacy).
async function syncPrimaryToProductLegacy(client, productId) {
  const { rows } = await client.query(
    'SELECT url FROM product_images WHERE product_id = $1 AND is_primary = TRUE LIMIT 1',
    [productId]
  );
  if (rows.length > 0) {
    await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [rows[0].url, productId]);
  }
}

// Si no queda ninguna primaria pero quedan imágenes, asciende la primera por sort_order.
async function ensurePrimaryExists(client, productId) {
  const { rows: anyPrimary } = await client.query(
    'SELECT id FROM product_images WHERE product_id = $1 AND is_primary = TRUE LIMIT 1',
    [productId]
  );
  if (anyPrimary.length > 0) return;
  const { rows: candidate } = await client.query(
    `SELECT id FROM product_images
     WHERE product_id = $1
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    [productId]
  );
  if (candidate.length > 0) {
    await client.query('UPDATE product_images SET is_primary = TRUE WHERE id = $1', [candidate[0].id]);
    await syncPrimaryToProductLegacy(client, productId);
  }
}

function deleteFileIfLocal(filename) {
  if (!filename) return;
  const fullPath = path.join(IMAGES_DIR, filename);
  // Solo borramos si está dentro de IMAGES_DIR (defensa contra path traversal)
  if (!fullPath.startsWith(IMAGES_DIR)) return;
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.warn('[products-admin-images] No se pudo borrar archivo:', fullPath, err.message);
    }
  }
}

async function productExists(productId) {
  if (!Number.isInteger(productId)) return null;
  const { rows } = await query('SELECT id, deleted_at FROM products WHERE id = $1', [productId]);
  return rows[0] || null;
}

// ─── GET /admin/products/:productId/images — listar galería ──────────────────
router.get('/admin/products/:productId/images', async (req, res) => {
  const productId = Number(req.params.productId);
  const product = await productExists(productId);
  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }
  const { rows } = await query(
    `SELECT id, product_id, url, filename, alt_text, is_primary, sort_order, created_at
     FROM product_images
     WHERE product_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );
  res.json(rows);
});

// ─── POST /admin/products/:productId/images — subir nueva imagen ─────────────
//   FormData: file=<image> [, alt_text, is_primary]
router.post(
  '/admin/products/:productId/images',
  uploadImageRateLimiter,
  (req, res, next) => {
    imageUpload.single('image')(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    const productId = Number(req.params.productId);
    const product = await productExists(productId);
    if (!product) {
      // Si subimos archivo pero el producto no existe, hay que limpiar
      if (req.file) deleteFileIfLocal(req.file.filename);
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    if (product.deleted_at) {
      if (req.file) deleteFileIfLocal(req.file.filename);
      return res.status(409).json({ error: 'No se puede agregar imágenes a producto eliminado' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Imagen requerida (campo "image")' });
    }

    const url = `/static/products/${req.file.filename}`;
    const altText = req.body.alt_text ? String(req.body.alt_text).trim() : null;
    const wantsPrimary = req.body.is_primary === '1' || req.body.is_primary === 'true';

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Calcular sort_order al final
      const { rows: maxRow } = await client.query(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM product_images WHERE product_id = $1',
        [productId]
      );
      const sortOrder = Number(maxRow[0].max_sort) + 1;

      // ¿Es la primera imagen? Auto-primary
      const { rows: countRow } = await client.query(
        'SELECT COUNT(*)::int AS n FROM product_images WHERE product_id = $1',
        [productId]
      );
      const isFirstImage = countRow[0].n === 0;
      const finalIsPrimary = wantsPrimary || isFirstImage;

      if (finalIsPrimary) {
        // Reset cualquier primaria previa
        await client.query(
          'UPDATE product_images SET is_primary = FALSE WHERE product_id = $1',
          [productId]
        );
      }

      const insert = await client.query(
        `INSERT INTO product_images (product_id, url, filename, alt_text, is_primary, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [productId, url, req.file.filename, altText, finalIsPrimary, sortOrder]
      );

      if (finalIsPrimary) {
        await syncPrimaryToProductLegacy(client, productId);
      }

      await logAudit(client, {
        productId,
        field: 'images',
        previousValue: null,
        newValue: url,
        changedBy: changedByFromReq(req),
        metadata: { op: 'add', filename: req.file.filename, is_primary: finalIsPrimary, sort_order: sortOrder },
      });

      await client.query('COMMIT');
      res.status(201).json(insert.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // Si falló la inserción, limpiar archivo huérfano
      deleteFileIfLocal(req.file.filename);
      console.error('[products-admin-images] add ERROR:', err.message);
      res.status(500).json({ error: 'Error al agregar imagen', detail: err.message });
    } finally {
      client.release();
    }
  }
);

// ─── PUT /admin/products/:productId/images/:imageId — editar metadata ────────
//   body: { alt_text?, is_primary?: boolean, sort_order?: int }
router.put('/admin/products/:productId/images/:imageId', async (req, res) => {
  const productId = Number(req.params.productId);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(productId) || !Number.isInteger(imageId)) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT * FROM product_images WHERE id = $1 AND product_id = $2 FOR UPDATE',
      [imageId, productId]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Imagen no encontrada para este producto' });
    }

    const updates = {};
    if ('alt_text' in req.body) {
      const v = req.body.alt_text;
      updates.alt_text = v === null || v === '' ? null : String(v).trim();
    }
    if ('sort_order' in req.body) {
      const n = Number(req.body.sort_order);
      if (!Number.isInteger(n)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'sort_order debe ser entero' });
      }
      updates.sort_order = n;
    }
    let togglingPrimary = false;
    if ('is_primary' in req.body) {
      const v = req.body.is_primary === true || req.body.is_primary === 1 || req.body.is_primary === '1' || req.body.is_primary === 'true';
      if (v && !before.rows[0].is_primary) {
        // Reset cualquier otra primaria
        await client.query(
          'UPDATE product_images SET is_primary = FALSE WHERE product_id = $1 AND id <> $2',
          [productId, imageId]
        );
        updates.is_primary = true;
        togglingPrimary = true;
      } else if (!v && before.rows[0].is_primary) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No se puede desmarcar la primaria sin asignar otra. Marque otra imagen como primaria.' });
      }
    }

    if (Object.keys(updates).length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sin cambios' });
    }

    const fields = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
    values.push(imageId);

    const result = await client.query(
      `UPDATE product_images SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    if (togglingPrimary) {
      await syncPrimaryToProductLegacy(client, productId);
    }

    await logAudit(client, {
      productId,
      field: 'images',
      previousValue: JSON.stringify({ id: imageId, is_primary: before.rows[0].is_primary, sort_order: before.rows[0].sort_order }),
      newValue: JSON.stringify({ id: imageId, ...updates }),
      changedBy: changedByFromReq(req),
      metadata: { op: 'update', image_id: imageId },
    });

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[products-admin-images] update ERROR:', err.message);
    res.status(500).json({ error: 'Error al actualizar imagen', detail: err.message });
  } finally {
    client.release();
  }
});

// ─── POST /admin/products/:productId/images/reorder — reordenamiento bulk ────
//   body: { order: [imageId, imageId, ...] } → asigna sort_order según índice
router.post('/admin/products/:productId/images/reorder', async (req, res) => {
  const productId = Number(req.params.productId);
  const order = Array.isArray(req.body.order) ? req.body.order.map(Number).filter(Number.isInteger) : null;
  if (!order || order.length === 0) {
    return res.status(400).json({ error: 'order debe ser un array de imageIds' });
  }

  const product = await productExists(productId);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Verificar que todas las imágenes pertenecen al producto
    const { rows: owned } = await client.query(
      'SELECT id FROM product_images WHERE product_id = $1',
      [productId]
    );
    const ownedSet = new Set(owned.map((r) => r.id));
    for (const id of order) {
      if (!ownedSet.has(id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Imagen ${id} no pertenece al producto ${productId}` });
      }
    }

    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE product_images SET sort_order = $1 WHERE id = $2 AND product_id = $3',
        [i, order[i], productId]
      );
    }

    await logAudit(client, {
      productId,
      field: 'images',
      previousValue: null,
      newValue: order.join(','),
      changedBy: changedByFromReq(req),
      metadata: { op: 'reorder', order },
    });

    await client.query('COMMIT');

    const { rows } = await query(
      `SELECT id, product_id, url, filename, alt_text, is_primary, sort_order, created_at
       FROM product_images
       WHERE product_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [productId]
    );
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[products-admin-images] reorder ERROR:', err.message);
    res.status(500).json({ error: 'Error al reordenar', detail: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /admin/products/:productId/images/:imageId — eliminar ────────────
router.delete('/admin/products/:productId/images/:imageId', async (req, res) => {
  const productId = Number(req.params.productId);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(productId) || !Number.isInteger(imageId)) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT * FROM product_images WHERE id = $1 AND product_id = $2 FOR UPDATE',
      [imageId, productId]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Imagen no encontrada para este producto' });
    }

    const removed = before.rows[0];

    await client.query('DELETE FROM product_images WHERE id = $1', [imageId]);

    // Si era la primaria, intentar promover otra
    if (removed.is_primary) {
      await ensurePrimaryExists(client, productId);
    }

    await logAudit(client, {
      productId,
      field: 'images',
      previousValue: removed.url,
      newValue: null,
      changedBy: changedByFromReq(req),
      metadata: { op: 'delete', image_id: imageId, was_primary: removed.is_primary, filename: removed.filename },
    });

    await client.query('COMMIT');

    // Cleanup del archivo físico (best-effort, fuera de la transacción)
    deleteFileIfLocal(removed.filename);

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[products-admin-images] delete ERROR:', err.message);
    res.status(500).json({ error: 'Error al eliminar imagen', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
