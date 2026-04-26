-- Migration 001: SumUp integration
-- Adds payment tracking columns to orders and creates payment_events audit table.

BEGIN;

-- 1) Orders: 5 new columns to track SumUp checkout lifecycle
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sumup_checkout_id     TEXT,
  ADD COLUMN IF NOT EXISTS sumup_transaction_id  TEXT,
  ADD COLUMN IF NOT EXISTS payment_status        TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_currency      TEXT NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS payment_updated_at    TIMESTAMP;

-- Keep payment_status within known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending','processing','paid','failed','cancelled','refunded'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_sumup_checkout ON orders(sumup_checkout_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- 2) payment_events: audit log of every SumUp event (widget callbacks + webhooks)
CREATE TABLE IF NOT EXISTS payment_events (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL DEFAULT 'sumup',
  event_type  TEXT NOT NULL,
  checkout_id TEXT,
  transaction_id TEXT,
  status      TEXT,
  amount      INTEGER,
  currency    TEXT,
  raw_payload JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order      ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_checkout   ON payment_events(checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events(created_at);

COMMIT;
