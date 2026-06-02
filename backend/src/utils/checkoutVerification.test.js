// Tests de helpers puros de checkoutVerification (C205). Los caminos con DB
// (issueCode/verifyCode/getSavedCustomerData) se prueban por smoke contra la
// BD local, no en este suite sin estado.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeEmail, isValidCodeFormat, generateCode, hashCode,
} = require('./checkoutVerification');

test('normalizeEmail: trim + lowercase, maneja nullish', () => {
  assert.equal(normalizeEmail('  Foo@Bar.CL '), 'foo@bar.cl');
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
});

test('isValidCodeFormat: exactamente 6 dígitos', () => {
  assert.ok(isValidCodeFormat('123456'));
  assert.ok(isValidCodeFormat(' 000000 '));
  assert.ok(!isValidCodeFormat('12345'));
  assert.ok(!isValidCodeFormat('1234567'));
  assert.ok(!isValidCodeFormat('12a456'));
  assert.ok(!isValidCodeFormat(''));
  assert.ok(!isValidCodeFormat(null));
});

test('generateCode: siempre 6 dígitos (incl. ceros a la izquierda)', () => {
  for (let i = 0; i < 500; i++) {
    const c = generateCode();
    assert.match(c, /^\d{6}$/, `código inválido: ${c}`);
  }
});

test('hashCode: SHA-256 hex determinista, no es el código en plano', () => {
  const h = hashCode('123456');
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(h, hashCode('123456'));
  assert.notEqual(h, '123456');
  assert.notEqual(hashCode('123456'), hashCode('654321'));
});
