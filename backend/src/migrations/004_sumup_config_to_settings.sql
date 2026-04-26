-- Migration 004: SumUp operational config relocation (env -> settings table)
-- Ciclo 15 — Completa L2 coherence para TODA la configuración SumUp
--
-- Motivación:
--   El usuario requiere configurar TODAS las variables SumUp desde la UI en
--   /admin → "Configuración". Tras Ciclos 6-8, los 4 secretos/no-secretos
--   ya viven en `settings` (sumup_api_key, sumup_merchant_code, sumup_app_id,
--   sumup_webhook_secret). Quedaban 2 variables operativas en .env que esta
--   migración traslada también:
--     - sumup_mode            (mock | live)   — toggle de adaptador
--     - sumup_return_url_base (URL base)      — se usa para construir las
--                                               return URLs del checkout
--
-- Cifrado: NO aplica. Ninguna de las dos es secreto.
--   - sumup_mode: valor corto del catálogo enumerado {mock, live}
--   - sumup_return_url_base: URL pública visible al navegador
--
-- Comportamiento runtime:
--   - backend/src/utils/sumup.config.js lee settings primero; si el row existe
--     y no está vacío, usa ese valor; de lo contrario cae al env var como
--     fallback (bootstrap). Caché in-proc TTL 5min por cada helper.
--   - El dispatcher en backend/src/utils/sumup.js resuelve el adapter al
--     momento de cada llamada (async), por lo que un cambio de modo vía UI
--     toma efecto en ≤ 5 minutos (o inmediatamente si el route handler llama
--     invalidateModeCache tras el POST).
--
-- Idempotente: puede reejecutarse sin efectos secundarios.

BEGIN;

-- 1) Seed de sumup_mode — por defecto 'mock' para entornos sin configurar
INSERT INTO settings (key, value, updated_at)
VALUES ('sumup_mode', 'mock', NOW())
ON CONFLICT (key) DO NOTHING;

-- 2) Seed de sumup_return_url_base — vacío; la UI lo carga con la URL pública
INSERT INTO settings (key, value, updated_at)
VALUES ('sumup_return_url_base', '', NOW())
ON CONFLICT (key) DO NOTHING;

-- Claves que quedan en el catálogo de settings tras Ciclo 15:
--   - sumup_api_key         (AES-256-GCM, creada on-demand)       [Ciclo 6]
--   - sumup_merchant_code   (AES-256-GCM, creada on-demand)       [Ciclo 6]
--   - sumup_app_id          (plano, seeded vacío por 002)          [Ciclo 6]
--   - sumup_webhook_secret  (AES-256-GCM, creada on-demand)       [Ciclo 8]
--   - sumup_mode            (plano, seeded 'mock')                 [Ciclo 15]
--   - sumup_return_url_base (plano, seeded vacío)                  [Ciclo 15]

COMMIT;
