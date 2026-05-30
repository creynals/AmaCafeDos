-- Cycle 156: Backfill customers desde orders y link orders.customer_id.
--
-- ROOT CAUSE (C156):
--   routes/orders.js POST /orders solo guardaba contact_name/email/phone inline
--   en orders, sin crear ni vincular una fila en customers. Resultado: la lista
--   "Clientes" del admin solo mostraba los 20 customers semilla (dummy de
--   seed.js), nunca los clientes reales que efectivamente generaron órdenes.
--
-- Esta migración es idempotente:
--   - Inserta solo customers cuyo email aún no exista (ON CONFLICT DO NOTHING).
--   - Solo actualiza orders.customer_id donde está NULL.
--   - Volver a correrla no produce duplicados ni reescrituras.

-- 1) Insertar un customers por cada email distinto presente en orders sin
--    customer_id. Usamos DISTINCT ON para escoger el contact_name/phone de la
--    orden más antigua de ese email (estable y trazable).
INSERT INTO customers (name, email, phone, created_at)
SELECT DISTINCT ON (LOWER(TRIM(contact_email)))
  contact_name,
  LOWER(TRIM(contact_email)) AS email,
  contact_phone,
  created_at
FROM orders
WHERE customer_id IS NULL
  AND contact_email IS NOT NULL
  AND TRIM(contact_email) <> ''
ORDER BY LOWER(TRIM(contact_email)), created_at ASC
ON CONFLICT (email) DO NOTHING;

-- 2) Vincular orders huérfanas a su customer via email normalizado.
UPDATE orders o
SET customer_id = c.id
FROM customers c
WHERE o.customer_id IS NULL
  AND o.contact_email IS NOT NULL
  AND LOWER(TRIM(o.contact_email)) = LOWER(TRIM(c.email));
