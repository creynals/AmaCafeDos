-- Migration 006 — Remove sumup_webhook_secret from settings
--
-- Ciclo 26 (Option A) — HMAC webhook verification removed entirely.
--
-- Motivación:
--   SumUp Dashboard no expone un "signing secret" por endpoint (verificado
--   con el usuario en Ciclo 24–25). Por tanto la función verifyWebhookSignature
--   nunca pudo firmar con un secreto válido emitido por SumUp, y su rechazo
--   401/invalid_signature era teatro criptográfico. La seguridad real vive en
--   getCheckout (status autoritativo desde SumUp) + idempotencia por event_id.
--
-- Esta migración borra la fila dormida `sumup_webhook_secret` de la tabla
-- settings para mantener coherencia L2 — ninguna parte del código la lee.
--
-- Idempotente: DELETE sobre una clave inexistente es un no-op.
--
-- Reversión: aplicar 003_sumup_webhook_secret_to_settings.sql (documento,
-- sin cambios DDL) y restaurar manualmente el valor cifrado.

DELETE FROM settings WHERE key = 'sumup_webhook_secret';
