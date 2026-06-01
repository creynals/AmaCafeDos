-- Migration 017: SMTP configuration relocation (env -> settings table)
-- Ciclo 176 — Implementación del plan ARCHITECT de C175
--
-- Patrón objetivo: coherencia con openrouter_api_key, recaptcha_secret_key
-- y sumup_api_key, que ya viven (parcialmente) cifrados (AES-256-GCM) en
-- la tabla `settings`. Movemos la configuración SMTP fuera de `.env` para
-- que el admin pueda gestionar el servidor de correo desde la UI.
--
-- Catálogo de claves SMTP:
--   - smtp_host       (no-secreto, plain text)   ej. smtp.gmail.com
--   - smtp_port       (no-secreto, plain text)   ej. 465 o 587
--   - smtp_secure     (no-secreto, plain text)   "true" | "false"
--   - smtp_user       (no-secreto, plain text)   usuario auth
--   - smtp_pass       (SECRETO, AES-256-GCM)     app-password / password
--   - smtp_from       (no-secreto, plain text)   "amaCafe <ventas@dominio>"
--   - smtp_reply_to   (no-secreto, plain text)   opcional
--   - smtp_enabled    (no-secreto, plain text)   "true" | "false" | "auto"
--
-- Esta migración NO cifra en SQL (la clave vive en Node via ENCRYPTION_SECRET).
-- Las claves se crean bajo demanda al primer POST /admin/settings/smtp.
-- Las variables de entorno (SMTP_*, MAIL_*) siguen funcionando como
-- fallback de bootstrap si la BD no tiene config aún.
--
-- Idempotente: puede reejecutarse sin efectos secundarios.

BEGIN;

-- No insertamos seeds: la configuración SMTP se crea bajo demanda via
-- POST /admin/settings/smtp con los valores que ingrese el admin.

COMMIT;
