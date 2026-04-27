// Cycle 82, OPTION B — Tests del módulo compartido keyManager.
// Run: node --test backend/src/utils/keyManager.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  SALT,
  deriveKey,
  encryptWithSecret,
  decryptWithSecret,
  rotateValue,
} = require('./keyManager');

const SECRET_A = 'secret-a-for-tests-2026';
const SECRET_B = 'secret-b-for-tests-2026';

test('constantes de algoritmo expuestas', () => {
  assert.equal(ALGORITHM, 'aes-256-gcm');
  assert.equal(KEY_LENGTH, 32);
  assert.equal(IV_LENGTH, 16);
  assert.equal(SALT, 'amacafe-salt');
});

test('deriveKey produce buffer determinista de 32 bytes', () => {
  const k1 = deriveKey(SECRET_A);
  const k2 = deriveKey(SECRET_A);
  assert.equal(k1.length, KEY_LENGTH);
  assert.deepEqual(k1, k2);
});

test('deriveKey con secrets distintos produce keys distintas', () => {
  const k1 = deriveKey(SECRET_A);
  const k2 = deriveKey(SECRET_B);
  assert.notDeepEqual(k1, k2);
});

test('deriveKey rechaza secret vacío o no-string', () => {
  assert.throws(() => deriveKey(''), /non-empty string/);
  assert.throws(() => deriveKey(null), /non-empty string/);
  assert.throws(() => deriveKey(undefined), /non-empty string/);
  assert.throws(() => deriveKey(123), /non-empty string/);
});

test('round-trip: encrypt → decrypt con mismo secret recupera plaintext', () => {
  const plain = 'sk_live_my-sumup-api-key-12345';
  const enc = encryptWithSecret(SECRET_A, plain);
  assert.ok(enc, 'encryptWithSecret debe devolver string no vacío');
  assert.notEqual(enc, plain, 'el ciphertext no debe coincidir con el plaintext');
  const dec = decryptWithSecret(SECRET_A, enc);
  assert.equal(dec, plain);
});

test('round-trip: cada encrypt produce IV/ciphertext distintos (no determinista)', () => {
  const plain = 'duplicate-test-payload';
  const e1 = encryptWithSecret(SECRET_A, plain);
  const e2 = encryptWithSecret(SECRET_A, plain);
  assert.notEqual(e1, e2, 'IV aleatorio debe garantizar ciphertexts distintos');
  assert.equal(decryptWithSecret(SECRET_A, e1), plain);
  assert.equal(decryptWithSecret(SECRET_A, e2), plain);
});

test('decryptWithSecret con secret incorrecto lanza error (auth tag mismatch)', () => {
  const enc = encryptWithSecret(SECRET_A, 'payload-secreto');
  assert.throws(() => decryptWithSecret(SECRET_B, enc));
});

test('decryptWithSecret con payload mal formado lanza error', () => {
  assert.throws(() => decryptWithSecret(SECRET_A, 'no-tiene-dos-puntos'), /malformed payload/);
  assert.throws(() => decryptWithSecret(SECRET_A, 'solo:dos-partes'), /malformed payload/);
});

test('decryptWithSecret con ciphertext alterado falla (integridad GCM)', () => {
  const enc = encryptWithSecret(SECRET_A, 'integridad-test');
  const [iv, tag, cipher] = enc.split(':');
  const tampered = [iv, tag, cipher.replace(/.$/, c => (c === '0' ? '1' : '0'))].join(':');
  assert.throws(() => decryptWithSecret(SECRET_A, tampered));
});

test('encryptWithSecret devuelve null para entradas vacías/nulas', () => {
  assert.equal(encryptWithSecret(SECRET_A, null), null);
  assert.equal(encryptWithSecret(SECRET_A, undefined), null);
  assert.equal(encryptWithSecret(SECRET_A, ''), null);
});

test('decryptWithSecret devuelve null para entradas vacías/nulas', () => {
  assert.equal(decryptWithSecret(SECRET_A, null), null);
  assert.equal(decryptWithSecret(SECRET_A, undefined), null);
  assert.equal(decryptWithSecret(SECRET_A, ''), null);
});

test('rotateValue: round-trip oldSecret → newSecret recupera plaintext', () => {
  const plain = 'rotation-roundtrip-payload';
  const encOld = encryptWithSecret(SECRET_A, plain);
  const encNew = rotateValue(SECRET_A, SECRET_B, encOld);
  assert.ok(encNew);
  assert.notEqual(encNew, encOld, 'tras rotar, el ciphertext debe cambiar');
  // Tras rotación, ya no se puede descifrar con el secret viejo.
  assert.throws(() => decryptWithSecret(SECRET_A, encNew));
  // Pero sí con el nuevo, recuperando el plaintext original.
  assert.equal(decryptWithSecret(SECRET_B, encNew), plain);
});

test('rotateValue: payload vacío devuelve null sin error', () => {
  assert.equal(rotateValue(SECRET_A, SECRET_B, null), null);
  assert.equal(rotateValue(SECRET_A, SECRET_B, ''), null);
});

test('rotateValue: ciphertext incompatible con oldSecret lanza error', () => {
  const enc = encryptWithSecret(SECRET_A, 'foo');
  assert.throws(() => rotateValue(SECRET_B, SECRET_A, enc));
});

test('payload sigue formato iv:tag:cipher en hex', () => {
  const enc = encryptWithSecret(SECRET_A, 'formato-test');
  const parts = enc.split(':');
  assert.equal(parts.length, 3);
  // IV: 16 bytes → 32 hex chars; tag: 16 bytes → 32 hex chars.
  assert.equal(parts[0].length, IV_LENGTH * 2);
  assert.equal(parts[1].length, 32);
  assert.match(parts[0], /^[0-9a-f]+$/);
  assert.match(parts[1], /^[0-9a-f]+$/);
  assert.match(parts[2], /^[0-9a-f]+$/);
});

test('compatibilidad: ciphertext producido por encryptWithSecret descifrable por crypto.js (mismo secret en env)', () => {
  // Simula el wrapper de crypto.js usando ENCRYPTION_SECRET dinámicamente.
  const prev = process.env.ENCRYPTION_SECRET;
  process.env.ENCRYPTION_SECRET = SECRET_A;
  try {
    // Limpiar require cache para forzar re-lectura del wrapper.
    delete require.cache[require.resolve('./crypto')];
    const { encrypt, decrypt } = require('./crypto');
    const plain = 'cross-module-compat';
    const enc1 = encryptWithSecret(SECRET_A, plain);
    assert.equal(decrypt(enc1), plain, 'crypto.decrypt debe leer ciphertext de keyManager');
    const enc2 = encrypt(plain);
    assert.equal(decryptWithSecret(SECRET_A, enc2), plain, 'keyManager.decryptWithSecret debe leer ciphertext de crypto.encrypt');
  } finally {
    if (prev === undefined) delete process.env.ENCRYPTION_SECRET;
    else process.env.ENCRYPTION_SECRET = prev;
    delete require.cache[require.resolve('./crypto')];
  }
});
