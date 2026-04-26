// Servicio de Bulk Import de productos vía Excel.
// Ciclo 3 SYNAPTIC — Decisiones aplicadas:
//   - SKU opcional para productos nuevos
//   - Categorías: solo existentes (no auto-crear)
//   - Soporta soft-delete vía columna action='delete' (deleted_at)
//   - Toda mutación se registra en products_audit con action='bulk_import'
//   - Operación transaccional: o todo el batch o nada (rollback global ante fallo crítico)
//   - Reporte fila-por-fila de errores no-críticos (DRY-RUN antes de aplicar)

const XLSX = require('xlsx');
const crypto = require('crypto');

const TEMPLATE_HEADERS = [
  'action',         // create | update | delete  (default: create)
  'sku',            // opcional para nuevos; identificador alternativo en update/delete
  'id',             // identificador en update/delete (se prefiere sobre sku si ambos)
  'name',           // requerido en create
  'description',
  'category',       // nombre canónico de categoria (debe existir)
  'price',          // entero CLP (sin decimales)
  'stock',          // entero >= 0
  'available',      // 1|0 (default 1 en create)
  'sort_order',     // entero (default 0)
  'image_url',      // path local (ej: /static/products/xxx.jpg) o URL completa
];

const VALID_ACTIONS = ['create', 'update', 'delete'];

function parseWorkbookFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    const err = new Error('El archivo Excel no contiene hojas.');
    err.statusCode = 400;
    throw err;
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  return rows;
}

function buildTemplateBuffer() {
  const wb = XLSX.utils.book_new();

  // Hoja 1: plantilla con headers + 2 filas de ejemplo
  const example = [
    {
      action: 'create',
      sku: 'CAFE-001',
      id: '',
      name: 'Café Especial 250g',
      description: 'Notas a chocolate y caramelo',
      category: 'cafe',
      price: 8990,
      stock: 50,
      available: 1,
      sort_order: 1,
      image_url: '/static/products/cafe-001.jpg',
    },
    {
      action: 'delete',
      sku: '',
      id: 42,
      name: '',
      description: '',
      category: '',
      price: '',
      stock: '',
      available: '',
      sort_order: '',
      image_url: '',
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(example, { header: TEMPLATE_HEADERS });
  XLSX.utils.book_append_sheet(wb, sheet, 'Productos');

  // Hoja 2: instrucciones
  const instructions = [
    { campo: 'action', descripcion: 'create | update | delete (default: create)' },
    { campo: 'sku', descripcion: 'Opcional. Único entre productos vivos. Útil como identificador alternativo en update/delete.' },
    { campo: 'id', descripcion: 'Identificador interno. Se usa en update/delete si está presente; tiene precedencia sobre sku.' },
    { campo: 'name', descripcion: 'Requerido en create. Opcional en update.' },
    { campo: 'description', descripcion: 'Opcional.' },
    { campo: 'category', descripcion: 'Nombre canónico de la categoría (debe existir previamente).' },
    { campo: 'price', descripcion: 'Entero en CLP. Sin decimales.' },
    { campo: 'stock', descripcion: 'Entero >= 0.' },
    { campo: 'available', descripcion: '1 = disponible, 0 = oculto. Default 1 en create.' },
    { campo: 'sort_order', descripcion: 'Entero. Default 0.' },
    { campo: 'image_url', descripcion: 'Path local servido vía /static/... o URL completa.' },
    { campo: '', descripcion: '' },
    { campo: 'NOTA delete', descripcion: 'action=delete realiza eliminación lógica (set deleted_at). El producto queda fuera del catálogo activo.' },
    { campo: 'NOTA categorías', descripcion: 'No se auto-crean. Si la categoría no existe, la fila falla.' },
  ];
  const sheet2 = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Instrucciones');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Normaliza valores que vienen de Excel (todo string si raw:false).
function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) ? n : null;
}

function toStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normalizeRow(rawRow) {
  return {
    action: (toStr(rawRow.action) || 'create').toLowerCase(),
    sku: toStr(rawRow.sku),
    id: toInt(rawRow.id),
    name: toStr(rawRow.name),
    description: toStr(rawRow.description),
    category: toStr(rawRow.category),
    price: toInt(rawRow.price),
    stock: toInt(rawRow.stock),
    available: toInt(rawRow.available),
    sort_order: toInt(rawRow.sort_order),
    image_url: toStr(rawRow.image_url),
  };
}

function validateRow(row, rowNumber, categoryMap, skuMap, idSet) {
  const errors = [];

  if (!VALID_ACTIONS.includes(row.action)) {
    errors.push(`action inválida: "${row.action}". Permitidas: ${VALID_ACTIONS.join(', ')}`);
  }

  if (row.action === 'create') {
    if (!row.name) errors.push('name es requerido para action=create');
    if (!row.category) {
      errors.push('category es requerido para action=create');
    } else if (!categoryMap.has(row.category)) {
      errors.push(`category "${row.category}" no existe (no se auto-crea)`);
    }
    if (row.price === null || row.price < 0) errors.push('price es requerido (entero >= 0) para action=create');
    if (row.stock !== null && row.stock < 0) errors.push('stock no puede ser negativo');
    if (row.sku && skuMap.has(row.sku)) {
      errors.push(`sku "${row.sku}" ya existe entre productos vivos`);
    }
  } else if (row.action === 'update') {
    if (!row.id && !row.sku) {
      errors.push('action=update requiere id o sku para identificar el producto');
    }
    if (row.id && !idSet.has(row.id)) {
      errors.push(`id ${row.id} no existe`);
    }
    if (!row.id && row.sku && !skuMap.has(row.sku)) {
      errors.push(`sku "${row.sku}" no existe entre productos vivos`);
    }
    if (row.category && !categoryMap.has(row.category)) {
      errors.push(`category "${row.category}" no existe (no se auto-crea)`);
    }
    if (row.price !== null && row.price < 0) errors.push('price no puede ser negativo');
    if (row.stock !== null && row.stock < 0) errors.push('stock no puede ser negativo');
  } else if (row.action === 'delete') {
    if (!row.id && !row.sku) {
      errors.push('action=delete requiere id o sku');
    }
    if (row.id && !idSet.has(row.id)) {
      errors.push(`id ${row.id} no existe`);
    }
    if (!row.id && row.sku && !skuMap.has(row.sku)) {
      errors.push(`sku "${row.sku}" no existe entre productos vivos`);
    }
  }

  return { rowNumber, row, errors };
}

async function loadCatalogMaps(client) {
  const cats = await client.query('SELECT id, name FROM categories');
  const categoryMap = new Map(cats.rows.map(c => [c.name, c.id]));

  const prods = await client.query(
    'SELECT id, sku FROM products WHERE deleted_at IS NULL'
  );
  const skuMap = new Map();
  const idSet = new Set();
  for (const p of prods.rows) {
    idSet.add(p.id);
    if (p.sku) skuMap.set(p.sku, p.id);
  }
  return { categoryMap, skuMap, idSet };
}

async function processBatch({ client, rows, batchId, changedBy }) {
  const { categoryMap, skuMap, idSet } = await loadCatalogMaps(client);

  // Fase 1: validación previa (no escribe nada).
  const validated = rows.map((rawRow, idx) => {
    const norm = normalizeRow(rawRow);
    return validateRow(norm, idx + 2, categoryMap, skuMap, idSet); // +2 = header + 1-index
  });

  const failed = validated.filter(v => v.errors.length > 0);
  if (failed.length > 0) {
    return {
      success: false,
      batch_id: batchId,
      total_rows: rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: failed.map(f => ({ row: f.rowNumber, errors: f.errors })),
    };
  }

  // Fase 2: aplicación transaccional.
  let created = 0, updated = 0, deleted = 0;
  for (const v of validated) {
    const r = v.row;
    if (r.action === 'create') {
      const categoryId = categoryMap.get(r.category);
      const result = await client.query(
        `INSERT INTO products (category_id, name, description, price, stock, available, sort_order, image_url, sku)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          categoryId, r.name, r.description, r.price,
          r.stock ?? 0, r.available ?? 1, r.sort_order ?? 0,
          r.image_url, r.sku,
        ]
      );
      const newId = result.rows[0].id;
      await client.query(
        `INSERT INTO products_audit (product_id, action, changed_by, changed_by_username, metadata)
         VALUES ($1, 'bulk_import', $2, $3, $4)`,
        [newId, changedBy.id, changedBy.username, JSON.stringify({
          batch_id: batchId, row: v.rowNumber, op: 'create', sku: r.sku,
        })]
      );
      created++;
    } else if (r.action === 'update') {
      const productId = r.id || skuMap.get(r.sku);
      const fields = [], values = [];
      let i = 1;
      if (r.name) { fields.push(`name = $${i++}`); values.push(r.name); }
      if (r.description !== null) { fields.push(`description = $${i++}`); values.push(r.description); }
      if (r.category) { fields.push(`category_id = $${i++}`); values.push(categoryMap.get(r.category)); }
      if (r.price !== null) { fields.push(`price = $${i++}`); values.push(r.price); }
      if (r.stock !== null) { fields.push(`stock = $${i++}`); values.push(r.stock); }
      if (r.available !== null) { fields.push(`available = $${i++}`); values.push(r.available); }
      if (r.sort_order !== null) { fields.push(`sort_order = $${i++}`); values.push(r.sort_order); }
      if (r.image_url !== null) { fields.push(`image_url = $${i++}`); values.push(r.image_url); }
      if (r.sku !== null) { fields.push(`sku = $${i++}`); values.push(r.sku); }

      if (fields.length === 0) continue; // nada que actualizar

      values.push(productId);
      await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${i}`,
        values
      );
      await client.query(
        `INSERT INTO products_audit (product_id, action, changed_by, changed_by_username, metadata)
         VALUES ($1, 'bulk_import', $2, $3, $4)`,
        [productId, changedBy.id, changedBy.username, JSON.stringify({
          batch_id: batchId, row: v.rowNumber, op: 'update', fields: fields.length,
        })]
      );
      updated++;
    } else if (r.action === 'delete') {
      const productId = r.id || skuMap.get(r.sku);
      await client.query(
        `UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
        [productId]
      );
      await client.query(
        `INSERT INTO products_audit (product_id, action, changed_by, changed_by_username, metadata)
         VALUES ($1, 'bulk_import', $2, $3, $4)`,
        [productId, changedBy.id, changedBy.username, JSON.stringify({
          batch_id: batchId, row: v.rowNumber, op: 'soft_delete',
        })]
      );
      deleted++;
    }
  }

  return {
    success: true,
    batch_id: batchId,
    total_rows: rows.length,
    processed: created + updated + deleted,
    created, updated, deleted,
    errors: [],
  };
}

function newBatchId() {
  return `bulk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = {
  TEMPLATE_HEADERS,
  buildTemplateBuffer,
  parseWorkbookFromBuffer,
  processBatch,
  newBatchId,
};
