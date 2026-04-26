-- Migration 011 — Inventory management foundation: SKU + products_audit hardening
--
-- Ciclo 103 (Immediate Execution / DG-079, Fase A; planificado en C101+C102 ARCHITECT MODE):
--
-- Motivación (del requerimiento C101 + decisiones C102 + clarificaciones C103):
--   Habilitar la pestaña "Inventario" del admin para CRUD individual + importación
--   masiva vía xlsx. Necesita:
--     - SKU para integraciones externas (decisión C102 #8): id + SKU, no solo id.
--     - Tabla de auditoría (decisión C102 #6): persistir TODO cambio CRUD/bulk.
--     - Soft-delete ya existe en products.deleted_at (no se modifica).
--   Persistencia SOLO de audit en C103 (clarificación: UI de auditoría diferida).
--
-- Decisiones aplicadas (C102 + C103):
--   - SKU para soft-deleted: PARCIAL — UNIQUE solo entre productos NO soft-deleted.
--     Permite reutilizar el SKU de un producto eliminado (lógicamente) para uno
--     nuevo, evitando colisiones permanentes y respetando la semántica del soft-delete.
--   - products_audit ya existe (snapshot 0 rows) — se endurece con CHECK constraint
--     en `action` y se agregan índices secundarios para reporting.
--
-- Cambios:
--   1. ADD COLUMN products.sku TEXT NULL (nullable: backfill manual posterior;
--      el CRUD nuevo exigirá valor desde la UI).
--   2. CREATE UNIQUE INDEX parcial idx_products_sku_active sobre products(sku)
--      WHERE deleted_at IS NULL AND sku IS NOT NULL.
--   3. ALTER products_audit:
--        - CHECK constraint products_audit_action_check (whitelist):
--            create | update | soft_delete | restore | stock_adjust | bulk_import
--        - Índices: idx_products_audit_action, idx_products_audit_created_at_desc,
--          idx_products_audit_changed_by (parcial WHERE changed_by IS NOT NULL).
--        - Comentarios sobre tabla y columnas (vocabulario canónico).
--
-- Idempotente: ADD COLUMN/INDEX con IF NOT EXISTS; CHECK constraint con
--   DROP IF EXISTS antes de ADD para permitir reaplicación.
-- Reversión:
--   - DROP INDEX idx_products_sku_active;
--   - ALTER TABLE products DROP COLUMN sku;
--   - ALTER TABLE products_audit DROP CONSTRAINT products_audit_action_check;
--   - DROP INDEX idx_products_audit_action, idx_products_audit_created_at_desc,
--     idx_products_audit_changed_by;

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) products.sku — columna nueva (nullable, backfill posterior desde UI)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

COMMENT ON COLUMN products.sku IS
  'SKU para integración con plataformas externas. Único entre productos NO soft-deleted (UNIQUE INDEX parcial idx_products_sku_active). NULL permitido en backfill; UI/backend deben exigir valor en CRUD nuevo.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) UNIQUE INDEX parcial: SKU único solo entre productos vivos
-- ────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_active
  ON products(sku)
  WHERE deleted_at IS NULL AND sku IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Hardening de products_audit (tabla preexistente, snapshot 0 rows)
-- ────────────────────────────────────────────────────────────────────────────

-- 3a) CHECK constraint sobre action (whitelist)
ALTER TABLE products_audit DROP CONSTRAINT IF EXISTS products_audit_action_check;

ALTER TABLE products_audit
  ADD CONSTRAINT products_audit_action_check
  CHECK (action = ANY (ARRAY[
    'create'::text,
    'update'::text,
    'soft_delete'::text,
    'restore'::text,
    'stock_adjust'::text,
    'bulk_import'::text
  ]));

-- 3b) Índices secundarios (filtro/reporting)
CREATE INDEX IF NOT EXISTS idx_products_audit_action
  ON products_audit(action);

CREATE INDEX IF NOT EXISTS idx_products_audit_created_at_desc
  ON products_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_audit_changed_by
  ON products_audit(changed_by)
  WHERE changed_by IS NOT NULL;

-- 3c) Comentarios canónicos
COMMENT ON TABLE products_audit IS
  'Tabla de auditoría — registra toda acción sobre products (CRUD individual + bulk_import xlsx). Diseñada como contraparte de orders_audit. Persistida desde C103; UI de visualización diferida a próximo ciclo.';

COMMENT ON COLUMN products_audit.action IS
  'Tipo de acción: create|update|soft_delete|restore|stock_adjust|bulk_import.';

COMMENT ON COLUMN products_audit.field IS
  'Nombre del campo afectado (e.g. ''stock'', ''price''). NULL para acciones full-row (create, soft_delete, bulk_import).';

COMMENT ON COLUMN products_audit.previous_value IS
  'Valor antes del cambio (string-encoded). NULL en create.';

COMMENT ON COLUMN products_audit.new_value IS
  'Valor después del cambio (string-encoded). NULL en soft_delete.';

COMMENT ON COLUMN products_audit.changed_by_username IS
  'Snapshot del username del admin al momento del cambio — preserva trazabilidad aunque admin_users se modifique.';

COMMENT ON COLUMN products_audit.metadata IS
  'JSONB libre para contexto adicional (ip, user_agent, batch_id en bulk_import, row_number del xlsx, etc).';

COMMIT;
