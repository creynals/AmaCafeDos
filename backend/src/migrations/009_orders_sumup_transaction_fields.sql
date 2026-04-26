-- Migration 009 — Add SumUp transaction trace fields to orders
--
-- Ciclo 82 (Immediate Execution / DG-079, propuesta diagnóstica C81):
--
-- Motivación:
--   transaction_code es el identificador que SumUp pide al abrir tickets de
--   soporte y reconciliación. Hoy solo persistimos sumup_transaction_id (id
--   técnico). Se agregan 3 columnas para capturar el snapshot de la primera
--   transacción del checkout en el momento en que el estado transiciona:
--
--     sumup_transaction_code   TEXT          → transactions[0].transaction_code
--                                              (id externo, cliente-friendly)
--     sumup_transaction_status TEXT          → transactions[0].status
--                                              (estado granular por-transacción)
--     sumup_transaction_at     TIMESTAMPTZ   → transactions[0].timestamp
--                                              (cuándo SumUp procesó el cobro)
--
--   No se modifica sumup_transaction_id (ya existe desde 001).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- Reversión: DROP COLUMN orders.sumup_transaction_code, ...
--   No backfill — columnas NULL hasta el próximo webhook/sync que las pueble.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sumup_transaction_code   TEXT,
  ADD COLUMN IF NOT EXISTS sumup_transaction_status TEXT,
  ADD COLUMN IF NOT EXISTS sumup_transaction_at     TIMESTAMPTZ;

COMMENT ON COLUMN orders.sumup_transaction_code IS
  'transactions[0].transaction_code de SumUp — identificador para soporte/reconciliación. NULL hasta autorización exitosa.';
COMMENT ON COLUMN orders.sumup_transaction_status IS
  'transactions[0].status de SumUp (SUCCESSFUL, FAILED, ...) — granular por-transacción. NULL hasta autorización.';
COMMENT ON COLUMN orders.sumup_transaction_at IS
  'transactions[0].timestamp de SumUp — momento en que SumUp procesó la transacción. NULL hasta autorización.';

-- Índice para búsqueda por transaction_code en operaciones de soporte.
-- Partial: solo indexamos rows con código real.
CREATE INDEX IF NOT EXISTS idx_orders_sumup_transaction_code
  ON orders(sumup_transaction_code)
  WHERE sumup_transaction_code IS NOT NULL;

COMMIT;
