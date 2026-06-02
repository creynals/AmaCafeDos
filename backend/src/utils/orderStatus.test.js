const { test } = require('node:test');
const assert = require('node:assert/strict');

const { confirmedSql, pendingSql, countedSql } = require('./orderStatus');

test('confirmedSql: paid + no cancelada/devuelta', () => {
  assert.equal(
    confirmedSql('o'),
    "(o.payment_status = 'paid' AND o.status NOT IN ('cancelled', 'returned'))",
  );
});

test('pendingSql: pending|processing + no cancelada/devuelta', () => {
  assert.equal(
    pendingSql('o'),
    "(o.payment_status IN ('pending', 'processing') AND o.status NOT IN ('cancelled', 'returned'))",
  );
});

test('countedSql: pending|processing|paid + no cancelada/devuelta', () => {
  assert.equal(
    countedSql('o'),
    "(o.payment_status IN ('pending', 'processing', 'paid') AND o.status NOT IN ('cancelled', 'returned'))",
  );
});

test('alias por defecto es "o"', () => {
  assert.equal(confirmedSql(), confirmedSql('o'));
  assert.equal(pendingSql(), pendingSql('o'));
  assert.equal(countedSql(), countedSql('o'));
});

test('respeta alias custom', () => {
  assert.ok(confirmedSql('ord').includes('ord.payment_status'));
  assert.ok(countedSql('ord').includes("ord.status NOT IN ('cancelled', 'returned')"));
});

test('counted = pending ∪ confirmed (cubre ambos payment_status)', () => {
  // counted debe incluir 'paid' (confirmado) y 'pending'/'processing' (pendiente),
  // y excluir failed/refunded/cancelled.
  const counted = countedSql('o');
  assert.ok(counted.includes("'pending'"));
  assert.ok(counted.includes("'processing'"));
  assert.ok(counted.includes("'paid'"));
  assert.ok(!counted.includes("'failed'"));
  assert.ok(!counted.includes("'refunded'"));
});
