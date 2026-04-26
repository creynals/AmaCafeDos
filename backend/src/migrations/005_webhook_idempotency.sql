-- Migration 005: Webhook idempotency & processed_at
-- Ciclo 18 — Cierra brecha P0 #5 identificada en Ciclo 16.
--
-- Motivación:
--   SumUp reintenta el webhook CHECKOUT_STATUS_CHANGED con política de backoff
--   (1 min, 5 min, 20 min, 2 h…). Sin idempotencia, un reintento legítimo
--   dispara una segunda transición de estado sobre `orders`, generando:
--     - payment_updated_at reescrito
--     - posibles emails / notificaciones duplicadas
--     - auditoría de payment_events con duplicados no trazables al mismo evento
--
--   SumUp identifica cada evento por un `id` en el payload (mismo id en cada
--   reintento). Esta migración añade las columnas necesarias para:
--     (a) deduplicar por `event_id` (UNIQUE parcial WHERE event_id IS NOT NULL)
--     (b) marcar `processed_at` cuando el handler termina la transición
--
-- Columnas nuevas en payment_events:
--   - event_id      TEXT    (id SumUp del evento; hoy = sha256(rawBody) ya que
--                            SumUp no envía un event_id estable en el payload)
--   - processed_at  TIMESTAMP (NULL = aún procesándose / pre-webhook; NOT NULL
--                              = handler terminó idempotentemente)
--   - signature_ok  BOOLEAN (legacy — diseñado para auditar HMAC; HMAC fue
--                            removido en Ciclo 25/26 y la columna se inserta
--                            siempre como NULL. Dropeada en migración 008.)
--
-- Índice único parcial (no afecta rows existentes donde event_id IS NULL):
--   idx_payment_events_event_id_unique ON payment_events(event_id)
--     WHERE event_id IS NOT NULL
--
-- Idempotente: puede reejecutarse sin efectos secundarios.

BEGIN;

ALTER TABLE payment_events
  ADD COLUMN IF NOT EXISTS event_id      TEXT,
  ADD COLUMN IF NOT EXISTS processed_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS signature_ok  BOOLEAN;

-- UNIQUE parcial sobre event_id: previene doble inserción por reintento SumUp.
-- Usamos partial index para tolerar rows legacy (callbacks del widget) sin
-- forzar backfill.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_event_id_unique
  ON payment_events(event_id)
  WHERE event_id IS NOT NULL;

-- Índice auxiliar para consultas del observability dashboard
-- (eventos aún en vuelo / procesados en una ventana de tiempo)
CREATE INDEX IF NOT EXISTS idx_payment_events_processed_at
  ON payment_events(processed_at);

COMMIT;
