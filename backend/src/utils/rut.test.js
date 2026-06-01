// node:test for Chilean RUT validator — Cycle 180

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRut, normalizeRut, formatRut, computeDv } = require('./rut');

test('computeDv: known cases (SII reference)', () => {
  assert.equal(computeDv('11111111'), '1');
  assert.equal(computeDv('12345678'), '5');
  assert.equal(computeDv('5000001'), 'K');
  assert.equal(computeDv('5000000'), '1');
});

test('validateRut accepts valid RUTs in multiple formats', () => {
  assert.equal(validateRut('11.111.111-1'), true);
  assert.equal(validateRut('11111111-1'), true);
  assert.equal(validateRut('111111111'), true);
  assert.equal(validateRut('5.000.001-k'), true);
  assert.equal(validateRut('5000001-K'), true);
  assert.equal(validateRut('12.345.678-5'), true);
});

test('validateRut rejects invalid check digit', () => {
  assert.equal(validateRut('11.111.111-2'), false);
  assert.equal(validateRut('12345678-6'), false);
  assert.equal(validateRut('5000001-1'), false);
});

test('validateRut rejects malformed inputs', () => {
  assert.equal(validateRut(''), false);
  assert.equal(validateRut(null), false);
  assert.equal(validateRut(undefined), false);
  assert.equal(validateRut('abcdefg-1'), false);
  assert.equal(validateRut('1'), false);
  assert.equal(validateRut('12-3'), false);
  assert.equal(validateRut('123456789-1'), false);
});

test('normalizeRut returns body-DV form or null', () => {
  assert.equal(normalizeRut('11.111.111-1'), '11111111-1');
  assert.equal(normalizeRut('5000001-k'), '5000001-K');
  assert.equal(normalizeRut('invalid'), null);
});

test('formatRut returns dotted display form', () => {
  assert.equal(formatRut('111111111'), '11.111.111-1');
  assert.equal(formatRut('5000001K'), '5.000.001-K');
  assert.equal(formatRut('12345678-5'), '12.345.678-5');
  assert.equal(formatRut('invalid'), null);
});
