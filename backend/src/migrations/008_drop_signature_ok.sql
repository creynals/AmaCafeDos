-- Migration 008: Drop payment_events.signature_ok
-- Ciclo 45 — Limpieza documental P1.
--
-- Motivación:
--   La columna `signature_ok` (BOOLEAN nullable) fue introducida en migración
--   005 (Ciclo 18) para auditar el resultado de la verificación HMAC del
--   webhook SumUp. En Ciclo 25/26 (Option A — HMAC removal) se eliminó toda
--   la maquinaria HMAC: SumUp Dashboard no expone "Signing secret" por
--   endpoint y la verificación se delega a getCheckout (estado autoritativo)
--   + idempotencia por event_id = sha256(rawBody).
--
--   Resultado: la columna se ha venido insertando siempre como NULL desde
--   Ciclo 26. Es ruido en el schema y oculta la realidad operacional. Esta
--   migración la elimina para que el schema refleje el modelo de seguridad
--   real.
--
-- Idempotente: usa DROP COLUMN IF EXISTS.
--
-- Compatibilidad:
--   - El handler `backend/src/routes/webhooks.js` ya no incluye signature_ok
--     en el INSERT (ajustado en Ciclo 45 junto con esta migración).
--   - No hay lecturas de signature_ok en el codebase (verificado vía grep).

BEGIN;

ALTER TABLE payment_events
  DROP COLUMN IF EXISTS signature_ok;

COMMIT;
