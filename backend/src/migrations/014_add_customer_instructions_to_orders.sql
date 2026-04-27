-- Migration 014 — Customer order-level instructions
--
-- Cycle 67 SYNAPTIC (Immediate Execution / DG-079):
--   El requerimiento del Cycle 66 pide un campo libre en el paso "Resumen"
--   del flujo "Confirma pedido" para que el cliente deje instrucciones de
--   preparación a nivel de orden completa (distinto de order_items.notes,
--   que son notas por producto, y de orders.address_notes, que son notas
--   de entrega para el repartidor).
--
--   El nuevo campo debe ser visible en:
--     - Listado de Órdenes (admin) → fila expandida
--     - Vista de Cocina (kanban) → tarjeta de orden
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_instructions TEXT;

COMMENT ON COLUMN orders.customer_instructions IS
  'Instrucciones libres a nivel de orden ingresadas por el cliente en el paso "Resumen" del checkout. Visibles para cocina y admin. Distinto de address_notes (entrega) y order_items.notes (por producto).';
