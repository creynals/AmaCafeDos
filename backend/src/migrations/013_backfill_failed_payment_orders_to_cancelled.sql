-- Migration 013 — Backfill de fulfillment para órdenes con pago rechazado
--
-- Ciclo 31 SYNAPTIC (Immediate Execution / DG-079):
--   Limpieza de datos legacy. Antes del Ciclo 31 los handlers de webhook /
--   /sync-payment / /sumup/result actualizaban payment_status pero NO
--   derivaban orders.status. Resultado: órdenes con payment_status terminal-
--   rechazado (failed/cancelled/refunded) quedaban en status='pending', y
--   aparecían inapropiadamente en Vista de Cocina. Caso testigo: orden #189
--   (Tarjeta=Falló, Estado=Pendiente).
--
-- Regla de derivación (idéntica a deriveFulfillmentFromPayment en utils/sumup.js):
--   payment_status ∈ {failed, cancelled, refunded}
--     Y status NOT IN {delivered, cancelled, returned}  -- no pisar terminales
--     ⟹ status := 'cancelled'
--
-- Idempotente: una segunda ejecución es no-op (la condición WHERE excluye
-- las órdenes ya cancelled).

BEGIN;

-- Snapshot de auditoría antes del UPDATE — registra cada orden afectada en
-- orders_audit (action='status_change' del whitelist; el origen del cambio
-- queda identificado por changed_by_email='system:migration_013' + reason).
INSERT INTO orders_audit (
  order_id,
  action,
  field,
  previous_value,
  new_value,
  changed_by_email,
  reason,
  metadata,
  created_at
)
SELECT
  id,
  'status_change',
  'status',
  status,
  'cancelled',
  'system:migration_013',
  'Backfill: payment terminal-rejected (failed/cancelled/refunded) without fulfillment cancellation',
  jsonb_build_object(
    'payment_status', payment_status,
    'migration', '013_backfill_failed_payment_orders_to_cancelled'
  ),
  NOW()
FROM orders
WHERE payment_status IN ('failed', 'cancelled', 'refunded')
  AND status NOT IN ('delivered', 'cancelled', 'returned');

-- Backfill efectivo
UPDATE orders
   SET status = 'cancelled',
       updated_at = NOW()
 WHERE payment_status IN ('failed', 'cancelled', 'refunded')
   AND status NOT IN ('delivered', 'cancelled', 'returned');

COMMIT;
