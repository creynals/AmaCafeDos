-- Migration 012 — Product image gallery (multi-imagen por producto)
--
-- Ciclo 10 SYNAPTIC (Immediate Execution / DG-079):
--   Habilita galería de múltiples imágenes por producto, con ordenamiento
--   y marca de imagen principal. Backward-compatible con products.image_url
--   (legacy: si un producto no tiene rows en product_images, sigue mostrando
--   image_url; cuando hay rows, la imagen marcada is_primary tiene prioridad).
--
-- Decisiones aplicadas:
--   - 1:N entre products y product_images (ON DELETE CASCADE: si se borra
--     físicamente un producto, sus imágenes también; soft-delete del producto
--     NO toca product_images, las imágenes siguen restaurables).
--   - sort_order INT (no UUIDs ni timestamps): permite reordenamiento UI con
--     drag-and-drop sin colisiones.
--   - is_primary BOOLEAN con UNIQUE INDEX parcial (solo una imagen primaria
--     por producto). Si todas son false, fallback a products.image_url.
--   - filename: opcional (TEXT NULL) — relevante solo para imágenes subidas
--     localmente (multer); URLs externas dejan filename NULL.
--   - alt_text: para accesibilidad y SEO (opcional).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Reversión:
--   - DROP INDEX idx_product_images_primary, idx_product_images_product;
--   - DROP TABLE product_images;

BEGIN;

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT,
  alt_text TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON product_images(product_id);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON product_images(product_id, sort_order ASC);

-- Solo una imagen primaria por producto (UNIQUE parcial)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_primary_unique
  ON product_images(product_id)
  WHERE is_primary = TRUE;

COMMENT ON TABLE product_images IS
  'Galería de imágenes por producto (1:N). Backward-compatible con products.image_url: si no hay rows aquí, se muestra image_url legacy; si las hay, la imagen is_primary=TRUE prevalece. Ciclo 10 SYNAPTIC.';

COMMENT ON COLUMN product_images.is_primary IS
  'TRUE = imagen principal mostrada por defecto en catálogo. Solo una por producto (UNIQUE INDEX parcial).';

COMMENT ON COLUMN product_images.sort_order IS
  'Orden de visualización en la galería (ASC). UI permite reordenar drag-and-drop.';

COMMENT ON COLUMN product_images.filename IS
  'Nombre de archivo en /fuentes/products/ para imágenes subidas localmente. NULL para URLs externas.';

COMMIT;
