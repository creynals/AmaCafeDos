-- Migration 003: SumUp webhook secret relocation (env -> settings table, L2)
-- Ciclo 8 — DG-C8-01 (revierte DG-C6-02)
--
-- Revierte la excepción hot-path que mantenía SUMUP_WEBHOOK_SECRET en .env.
-- El valor ahora vive cifrado AES-256-GCM en `settings` como el resto de
-- credenciales. La objeción de latencia se resuelve en backend con caché
-- in-proc TTL 5min (ver backend/src/utils/sumup.js:getWebhookSecret).
--
-- Al igual que 002, esta migración NO puede cifrar en SQL (la clave de
-- cifrado vive en Node vía ENCRYPTION_SECRET). Acciones en SQL:
--   - No seed de row placeholder: la row se crea al primer POST
--     /admin/settings/sumup-webhook con el valor cifrado aplicado
--     por backend/src/utils/crypto.js.
--   - Guardia informativa: si ya existe row manual plana, la dejamos
--     intacta para que el admin pueda reescribirla vía endpoint (que
--     re-guarda cifrada).
--
-- Idempotente: puede reejecutarse sin efectos secundarios.

BEGIN;

-- Documentación del catálogo de settings (no INSERT — se crea on demand cifrado):
--   sumup_webhook_secret (AES-256-GCM, formato iv:authTag:ciphertext)

-- No-op: placeholder para que el script de verificación pueda contar rows sin error.
SELECT 1 AS migration_003_applied;

COMMIT;
