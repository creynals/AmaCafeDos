-- Migration 018 — Códigos de verificación para autocompletar datos en checkout
--
-- Cycle 205: el cliente puede cargar sus datos guardados (nombre, teléfono y
-- última dirección) ingresando un código de un solo uso enviado a su email.
-- El código es el control de seguridad que evita la fuga de PII: sin probar
-- control del inbox, un email no puede recuperar los datos de ese cliente.
--
-- Diseño:
--   - code_hash: SHA-256 del código de 6 dígitos (nunca se guarda en plano).
--   - expires_at: TTL corto (la app usa 10 min).
--   - attempts: intentos de verificación fallidos; al alcanzar el máximo el
--     código queda inutilizable (la app lo trata como inválido).
--   - used_at: marca de uso único (un código válido se consume al usarse).
--   - Al solicitar un código nuevo, la app invalida los previos no usados del
--     mismo email (no se hace en DB, sino en checkoutVerification.js).
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
-- Reversión: DROP TABLE customer_verification_codes;

CREATE TABLE IF NOT EXISTS customer_verification_codes (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup por email del código activo más reciente.
CREATE INDEX IF NOT EXISTS idx_cvc_email_created
  ON customer_verification_codes(email, created_at DESC);

-- Para limpieza eventual de códigos expirados.
CREATE INDEX IF NOT EXISTS idx_cvc_expires_at
  ON customer_verification_codes(expires_at);

COMMENT ON TABLE customer_verification_codes IS
  'OTP de un solo uso para autocompletar datos del cliente en checkout (C205). code_hash = SHA-256; nunca se guarda el código en plano.';
