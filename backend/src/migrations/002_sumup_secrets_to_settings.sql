-- Migration 002: SumUp secrets relocation (env -> settings table, L2 maturity)
-- Ciclo 6 — DG-C6-01
--
-- Patrón objetivo: coherencia con openrouter_api_key y recaptcha_secret_key,
-- que ya viven cifrados (AES-256-GCM) en la tabla `settings`.
--
-- Esta migración NO puede cifrar en SQL (la clave de cifrado vive en Node
-- vía ENCRYPTION_SECRET). Lo que sí hace en SQL:
--   - Documenta las claves nuevas del catálogo de settings.
--   - Inserta `sumup_app_id` como placeholder vacío (no es secreto).
--   - Deja `sumup_api_key` y `sumup_merchant_code` fuera del seed para que
--     se creen al primer POST /admin/settings/sumup (con cifrado aplicado
--     por backend/src/utils/crypto.js).
--   - Elimina cualquier row legado con clave `sumup_pay_to_email`, que queda
--     deprecada por no ser consumida por backend/src/utils/sumup.js.
--
-- Idempotente: puede reejecutarse sin efectos secundarios.

BEGIN;

-- 1) Seed no-secreto: sumup_app_id en claro (se carga en el frontend widget)
INSERT INTO settings (key, value, updated_at)
VALUES ('sumup_app_id', '', NOW())
ON CONFLICT (key) DO NOTHING;

-- 2) Limpieza: eliminar key deprecada (si alguien la sembró manualmente antes)
DELETE FROM settings WHERE key = 'sumup_pay_to_email';

-- Claves que se crean bajo demanda via POST /admin/settings/sumup (cifradas):
--   - sumup_api_key        (AES-256-GCM, formato iv:authTag:ciphertext)
--   - sumup_merchant_code  (AES-256-GCM, formato iv:authTag:ciphertext)

COMMIT;
