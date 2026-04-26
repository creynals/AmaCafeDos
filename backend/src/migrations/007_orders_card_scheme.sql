-- Migration 007 — Add orders.card_scheme + relax payment_method whitelist
--
-- Ciclo 31 (Option C — Modernización SumUp-Native, gate consolidado DG #1+#2+#3).
--
-- Motivación:
--   La distinción frontend "tarjeta_debito" / "tarjeta_credito" era una etiqueta
--   declarativa sin validación real (el usuario puede elegir "débito" y pagar
--   con crédito sin que detectemos la divergencia). La fuente autoritativa de
--   la marca/tipo es la respuesta de SumUp post-autorización, no el botón que
--   el usuario clickeó. Esta migración habilita esa coherencia:
--
--     - card_scheme TEXT NULL en orders → poblada por completeCheckout o
--       getCheckout (webhook) extrayendo transactions[0].card.type
--     - Valores esperados (no constraint, SumUp puede agregar marcas):
--         VISA, MASTERCARD, AMEX, MAESTRO, DINERS, ELO, HIPERCARD, JCB,
--         DISCOVER, UNIONPAY (nullable hasta que el pago se procese)
--
--   payment_method del lado backend pasa a aceptar 'tarjeta' como valor
--   unificado. Los botones débito/crédito del frontend mapean al mismo valor;
--   se deja la validación a nivel de route handler (no CHECK constraint en DB
--   para evitar romper rows legacy con valores antiguos).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--
-- Reversión: DROP COLUMN orders.card_scheme; DROP INDEX
--   idx_orders_card_scheme. No backfill required — column es NULL por defecto.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS card_scheme TEXT;

COMMENT ON COLUMN orders.card_scheme IS
  'Marca de tarjeta reportada por SumUp tras autorización (VISA, MASTERCARD, AMEX, ...). NULL hasta que el pago se procesa o si el método no es tarjeta.';

-- Índice para analytics (margen por marca, fraud monitoring).
-- Partial: solo indexamos rows con card_scheme poblado.
CREATE INDEX IF NOT EXISTS idx_orders_card_scheme
  ON orders(card_scheme)
  WHERE card_scheme IS NOT NULL;

COMMIT;
