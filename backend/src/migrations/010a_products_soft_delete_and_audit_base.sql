-- Migration 010a — Idempotent base: products.deleted_at + products_audit table
--
-- Ciclo 3 SYNAPTIC (Bulk Import implementation):
--   La migración 011 (SKU + audit hardening) asume que:
--     1. products.deleted_at YA EXISTE (referenciada en idx_products_sku_active)
--     2. products_audit YA EXISTE (con CHECK constraint y comentarios)
--
--   Sin embargo, ninguna migración previa (001-010) crea estas estructuras,
--   ni tampoco están en initSchema() de database.js.
--
--   Esta migración 010a se ejecuta lexicográficamente entre 010_ y 011_,
--   creando la base que 011 endurece. En BDs ya pobladas, todas las
--   operaciones son idempotentes (IF NOT EXISTS) y constituyen un no-op.
--
-- Cambios:
--   1. ADD COLUMN products.deleted_at TIMESTAMP NULL (soft-delete marker)
--   2. CREATE TABLE products_audit (auditoría completa de cambios sobre products)
--   3. INDEX idx_products_deleted_at (queries de productos vivos vs eliminados)

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) products.deleted_at — soft-delete marker
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON products(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN products.deleted_at IS
  'Timestamp de soft-delete. NULL = producto activo. NOT NULL = eliminado lógicamente. Filtrar siempre por deleted_at IS NULL en queries de catálogo.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) products_audit — auditoría completa
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products_audit (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  field TEXT,
  previous_value TEXT,
  new_value TEXT,
  changed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  changed_by_username TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices base (la 011 añade índices secundarios sobre estos)
CREATE INDEX IF NOT EXISTS idx_products_audit_product
  ON products_audit(product_id);

COMMIT;
