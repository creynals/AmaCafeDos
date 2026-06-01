// C195 regression — describe() must:
//   1. Force secure=true when port=465 even if env/db says SMTP_SECURE=false
//      (Railway env shipped this exact mismatch → tcp_timeout for 10+ cycles).
//   2. Prefer process.env.SMTP_PASS over an undecryptable DB ciphertext
//      (ENCRYPTION_SECRET drift between secrets store and DB row).
//
// Stubs ../models/database and ./crypto via require.cache so the test runs
// without Postgres and without leaking the project's real ENCRYPTION_SECRET.
//
// Run: node --test backend/src/utils/mailer.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

const DB_PATH = require.resolve('../models/database');
const CRYPTO_PATH = require.resolve('./crypto');
const MAILER_PATH = require.resolve('./mailer');

function loadMailerWithStubs({ dbRows = [], decryptResult = null } = {}) {
  delete require.cache[MAILER_PATH];
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: { query: async () => ({ rows: dbRows }) },
  };
  require.cache[CRYPTO_PATH] = {
    id: CRYPTO_PATH,
    filename: CRYPTO_PATH,
    loaded: true,
    exports: { decrypt: () => decryptResult, encrypt: (v) => v },
  };
  return require('./mailer');
}

function withEnv(overrides, fn) {
  const original = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

test('port 465 forces secure=true even if env SMTP_SECURE=false', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  await withEnv(
    {
      SMTP_HOST: 'mail.golab.cl',
      SMTP_PORT: '465',
      SMTP_SECURE: 'false',
      SMTP_USER: 'contacto@golab.cl',
      SMTP_PASS: 'plaintext-from-env',
      MAIL_FROM: 'contacto@golab.cl',
      MAIL_ENABLED: 'true',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.port, 465);
      assert.equal(cfg.secure, true, 'port 465 must force secure=true');
      assert.equal(cfg.enabled, true);
    },
  );
});

test('port 587 forces secure=false even if SMTP_SECURE=true', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  await withEnv(
    {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'true',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      MAIL_FROM: 'u@example.com',
      MAIL_ENABLED: 'true',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.port, 587);
      assert.equal(cfg.secure, false, 'port 587 must force secure=false (STARTTLS)');
    },
  );
});

test('env SMTP_PASS wins over undecryptable DB ciphertext', async () => {
  const mailer = loadMailerWithStubs({
    dbRows: [{ key: 'smtp_pass', value: 'garbled-cipher' }],
    decryptResult: null,
  });
  await withEnv(
    {
      SMTP_HOST: 'mail.golab.cl',
      SMTP_PORT: '465',
      SMTP_SECURE: 'false',
      SMTP_USER: 'u',
      SMTP_PASS: 'env-rescue',
      MAIL_FROM: 'u@example.com',
      MAIL_ENABLED: 'true',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.sources.pass, 'env');
      assert.equal(cfg.dbPassPresent, true);
      assert.equal(cfg.decryptOk, false);
      assert.equal(cfg.enabled, true);
    },
  );
});

test('env SMTP_PASS wins over successfully-decrypted DB value (env-first)', async () => {
  const mailer = loadMailerWithStubs({
    dbRows: [{ key: 'smtp_pass', value: 'cipher' }],
    decryptResult: 'db-decrypted-pass',
  });
  await withEnv(
    {
      SMTP_HOST: 'mail.golab.cl',
      SMTP_PORT: '465',
      SMTP_USER: 'u',
      SMTP_PASS: 'env-takes-priority',
      MAIL_FROM: 'u@example.com',
      MAIL_ENABLED: 'true',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.sources.pass, 'env');
      assert.equal(cfg.dbPassPresent, true);
      assert.equal(cfg.decryptOk, true);
    },
  );
});

test('falls back to DB pass when env SMTP_PASS unset', async () => {
  const mailer = loadMailerWithStubs({
    dbRows: [{ key: 'smtp_pass', value: 'cipher' }],
    decryptResult: 'db-only',
  });
  await withEnv(
    {
      SMTP_HOST: 'mail.golab.cl',
      SMTP_PORT: '465',
      SMTP_USER: 'u',
      SMTP_PASS: undefined,
      MAIL_FROM: 'u@example.com',
      MAIL_ENABLED: 'true',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.sources.pass, 'db');
      assert.equal(cfg.decryptOk, true);
    },
  );
});
