// Endpoints admin para gestión masiva de productos vía Excel.
// Ciclo 3 SYNAPTIC — Bulk Import (separado de admin.js para mantener
// admin.js centrado en métricas y dashboard, mientras esta ruta concentra
// las operaciones de mutación masiva sobre el catálogo).

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const { query, getClient } = require('../models/database');
const {
  buildTemplateBuffer,
  parseWorkbookFromBuffer,
  processBatch,
  newBatchId,
} = require('../services/productsBulkImport');
const { bulkImportRateLimiter, uploadImageRateLimiter } = require('../middleware/security');
const { IMAGES_DIR, ensureImagesDir } = require('../utils/imageStorage');

const router = express.Router();

// ─── Multer ──────────────────────────────────────────────────────────────────
// xlsx en memoria (parseo directo desde buffer); imágenes a disco local.

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    if (!ok) return cb(new Error('Archivo debe ser .xlsx o .xls'));
    cb(null, true);
  },
});

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

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GET /api/admin/products/bulk-template — descarga plantilla Excel
router.get('/admin/products/bulk-template', (_req, res) => {
  const buf = buildTemplateBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.xlsx"');
  res.send(buf);
});

// GET /api/admin/products/categories — categorías existentes (helper UI)
router.get('/admin/products/categories', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, name, display_name FROM categories ORDER BY sort_order, display_name'
  );
  res.json(rows);
});

// POST /api/admin/products/bulk-import — sube xlsx, valida y aplica
//   ?dry_run=1 → solo valida, no escribe
router.post(
  '/admin/products/bulk-import',
  bulkImportRateLimiter,
  (req, res, next) => {
    xlsxUpload.single('file')(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Archivo xlsx requerido (campo "file")' });
    }

    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    const changedBy = {
      id: req.authUser.user_id,
      username: req.authUser.username,
    };

    let rows;
    try {
      rows = parseWorkbookFromBuffer(req.file.buffer);
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        error: err.message || 'Error al parsear el archivo Excel',
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'El archivo no contiene filas de datos.' });
    }

    if (rows.length > 5000) {
      return res.status(413).json({
        error: `Demasiadas filas (${rows.length}). Máximo 5000 por batch.`,
      });
    }

    const batchId = newBatchId();
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await processBatch({ client, rows, batchId, changedBy });

      if (!result.success) {
        await client.query('ROLLBACK');
        return res.status(422).json(result);
      }

      if (dryRun) {
        await client.query('ROLLBACK');
        return res.json({ ...result, dry_run: true });
      }

      await client.query('COMMIT');
      res.json(result);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[bulk-import] ERROR:', err.message);
      res.status(500).json({
        error: 'Error procesando el batch. Ningún cambio fue aplicado.',
        detail: err.message,
        batch_id: batchId,
      });
    } finally {
      client.release();
    }
  }
);

// POST /api/admin/products/upload-image — sube una imagen, retorna URL local
router.post(
  '/admin/products/upload-image',
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
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Imagen requerida (campo "image")' });
    }
    const url = `/static/products/${req.file.filename}`;
    res.json({
      url,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }
);

module.exports = router;
