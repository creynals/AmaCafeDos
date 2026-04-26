-- Migration 010 — Order fulfillment status whitelist + generic orders_audit table
--
-- Ciclo 98 (Immediate Execution / DG-079, planificado en C97 ARCHITECT MODE):
--
-- Motivación (del requerimiento de C97):
--   Necesidad: separar el ESTADO de la orden (lifecycle de fulfillment) del
--   ESTADO de pago (`payment_status`). El admin debe poder ver/buscar/editar
--   ordenes y cambiar su estado a través de un flujo controlado, donde solo
--   se pueden mover de estado las que tienen pago aceptado (payment_status='paid').
--
-- Vocabulario fulfillment (canonical, codificado en CHECK constraint):
--     pending           — orden creada, esperando confirmación de pago o inicio
--     in_progress       — orden tomada, en preparación
--     out_for_delivery  — orden en ruta de entrega
--     delivered         — orden entregada al cliente
--     cancelled         — orden cancelada (por admin o sistema)
--     returned          — orden devuelta tras entrega (post-fulfillment)
--
--   UI display (es-CL):
--     pending          → "Pendiente"
--     in_progress      → "En curso"
--     out_for_delivery → "En proceso de entrega"
--     delivered        → "Entregado"
--     cancelled        → "Cancelado"
--     returned         → "Devuelto"
--
-- Cambios:
--   1. Migrar valores legacy en orders.status:
--        legacy 'completed' AND payment_status='paid'  → 'delivered'
--        legacy 'completed' AND payment_status<>'paid' → 'pending'   (no se completó el pago)
--        legacy 'pending'                              → 'pending'
--      (En este snapshot: 0 rows con payment_status='paid', 155 con completed/no-paid → todas a pending)
--
--   2. ALTER orders DEFAULT 'pending' (ya lo era) y CHECK constraint con whitelist.
--
--   3. Índice idx_orders_status (filtrado en panel admin) +
--      idx_orders_created_at_desc (paginación por fecha).
--
--   4. Crear tabla orders_audit — superset genérico de order_status_history,
--      diseñada para registrar cualquier acción auditada sobre una orden:
--
--        id              SERIAL PK
--        order_id        INT FK → orders(id) ON DELETE CASCADE
--        action          TEXT NOT NULL  (whitelist via CHECK)
--                          status_change | payment_update | manual_edit
--                          note_added    | refund_initiated
--        field           TEXT NULL  (campo afectado, e.g. 'status')
--        previous_value  TEXT NULL  (valor antes del cambio)
--        new_value       TEXT NULL  (valor después del cambio)
--        changed_by      INT NULL FK → admin_users(id)
--        changed_by_email TEXT NULL  (snapshot por legibilidad si admin se borra)
--        reason          TEXT NULL  (justificación libre del operador)
--        metadata        JSONB NOT NULL DEFAULT '{}'  (contexto extra)
--        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
--
--   5. order_status_history queda DEPRECADA (no se elimina — preserve previous
--      schema for safety). Comment indicates orders_audit is canonical going
--      forward. order_status_history tenía 0 filas en el snapshot, por lo que
--      no hay backfill necesario.
--
-- Idempotente: ADD COLUMN/INDEX/CONSTRAINT con IF NOT EXISTS donde aplica;
--   constraint con DROP IF EXISTS antes de ADD para permitir reaplicación.
-- Reversión:
--   - DROP CONSTRAINT orders_status_check;
--   - DROP TABLE orders_audit;
--   - DROP INDEX idx_orders_status, idx_orders_created_at_desc;

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Backfill orders.status con vocabulario nuevo
-- ────────────────────────────────────────────────────────────────────────────

-- legacy 'completed' + paid → delivered
UPDATE orders
   SET status = 'delivered'
 WHERE status = 'completed'
   AND payment_status = 'paid';

-- legacy 'completed' + no paid → pending (el flujo de fulfillment recién empieza
-- cuando se confirma el pago; orders sin pago aceptado no deberían avanzar)
UPDATE orders
   SET status = 'pending'
 WHERE status = 'completed'
   AND payment_status <> 'paid';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) CHECK constraint con whitelist de fulfillment
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'in_progress'::text,
    'out_for_delivery'::text,
    'delivered'::text,
    'cancelled'::text,
    'returned'::text
  ]));

COMMENT ON COLUMN orders.status IS
  'Fulfillment lifecycle: pending|in_progress|out_for_delivery|delivered|cancelled|returned. Distinto de payment_status. Solo se puede avanzar si payment_status=paid (regla aplicada en backend, no DB).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Índices para panel admin (búsqueda y paginación)
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
  ON orders(created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Tabla orders_audit (audit log genérico)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders_audit (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action           TEXT NOT NULL,
  field            TEXT,
  previous_value   TEXT,
  new_value        TEXT,
  changed_by       INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  changed_by_email TEXT,
  reason           TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_audit_action_check
    CHECK (action = ANY (ARRAY[
      'status_change'::text,
      'payment_update'::text,
      'manual_edit'::text,
      'note_added'::text,
      'refund_initiated'::text
    ]))
);

CREATE INDEX IF NOT EXISTS idx_orders_audit_order_id
  ON orders_audit(order_id);

CREATE INDEX IF NOT EXISTS idx_orders_audit_action
  ON orders_audit(action);

CREATE INDEX IF NOT EXISTS idx_orders_audit_created_at_desc
  ON orders_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_audit_changed_by
  ON orders_audit(changed_by)
  WHERE changed_by IS NOT NULL;

COMMENT ON TABLE orders_audit IS
  'Tabla de auditoría — registra toda acción auditable sobre una orden (cambios de estado, ediciones manuales, notas, reembolsos). Superset de order_status_history (deprecada).';

COMMENT ON COLUMN orders_audit.action IS
  'Tipo de acción: status_change|payment_update|manual_edit|note_added|refund_initiated.';
COMMENT ON COLUMN orders_audit.field IS
  'Nombre del campo afectado (e.g. ''status''). NULL si la acción no es field-level (e.g. note_added).';
COMMENT ON COLUMN orders_audit.changed_by_email IS
  'Snapshot del email del admin al momento del cambio — preserva trazabilidad si el admin se elimina.';
COMMENT ON COLUMN orders_audit.metadata IS
  'JSONB libre para contexto adicional (ip, user_agent, request_id, etc.).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Deprecación de order_status_history (no destructivo)
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE order_status_history IS
  'DEPRECATED desde Migration 010 (Ciclo 98). Reemplazada por orders_audit. Conservada por seguridad — no usar en código nuevo.';

COMMIT;
