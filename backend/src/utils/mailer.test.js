// Mailer tests — cubre:
//   C195 SMTP regressions:
//     1. port=465 fuerza secure=true
//     2. port=587 fuerza secure=false
//     3. env SMTP_PASS gana sobre DB ciphertext indescifrable
//     4. env SMTP_PASS gana incluso sobre DB descifrable (env-first)
//     5. fallback a DB pass cuando env SMTP_PASS está ausente
//   C200 Resend / selector:
//     6. RESEND_API_KEY env → provider='resend'
//     7. mail_provider='smtp' explícito gana sobre RESEND_API_KEY
//     8. Resend describe() no expone API key
//     9. Resend sendMail() llama POST /emails con Authorization Bearer
//    10. Resend verifyConnection() llama GET /domains
//
// Stubs ../models/database y ./crypto vía require.cache. Stub global.fetch
// para las pruebas de Resend.
//
// Run: node --test backend/src/utils/mailer.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

const DB_PATH = require.resolve('../models/database');
const CRYPTO_PATH = require.resolve('./crypto');
const MAILER_PATH = require.resolve('./mailer');
const SMTP_TRANSPORT_PATH = require.resolve('./transports/smtp');
const RESEND_TRANSPORT_PATH = require.resolve('./transports/resend');

function loadMailerWithStubs({ dbRows = [], decryptResult = null } = {}) {
  delete require.cache[MAILER_PATH];
  delete require.cache[SMTP_TRANSPORT_PATH];
  delete require.cache[RESEND_TRANSPORT_PATH];
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
    exports: {
      decrypt: (v) => (typeof decryptResult === 'function' ? decryptResult(v) : decryptResult),
      encrypt: (v) => v,
    },
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

function withFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  return Promise.resolve(fn()).finally(() => {
    global.fetch = original;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SMTP regression tests (C195)
// ─────────────────────────────────────────────────────────────────────────────

test('port 465 forces secure=true even if env SMTP_SECURE=false', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: undefined,
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
      assert.equal(cfg.provider, 'smtp');
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
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: undefined,
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
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: undefined,
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
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: undefined,
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
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: undefined,
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

// ─────────────────────────────────────────────────────────────────────────────
// C200: Resend selector + transport tests
// ─────────────────────────────────────────────────────────────────────────────

test('RESEND_API_KEY env selects resend provider', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_test_abcdef123456',
      MAIL_FROM: 'noreply@golab.cl',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.provider, 'resend');
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.hasAuth, true);
      assert.equal(cfg.sources.apiKey, 'env');
      assert.equal(cfg.apiKeyMasked, 're_tes…3456');
      // Sanity: la API key NUNCA debe aparecer en describe()
      const json = JSON.stringify(cfg);
      assert.equal(json.includes('re_test_abcdef123456'), false, 'describe() leaked raw API key');
    },
  );
});

test('explicit mail_provider=smtp overrides RESEND_API_KEY presence', async () => {
  const mailer = loadMailerWithStubs({
    dbRows: [{ key: 'mail_provider', value: 'smtp' }],
  });
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_should_be_ignored',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      MAIL_FROM: 'u@example.com',
      MAIL_ENABLED: 'true',
    },
    async () => {
      mailer.invalidateCache();
      const cfg = await mailer.describe();
      assert.equal(cfg.provider, 'smtp');
      assert.equal(cfg.port, 587);
    },
  );
});

test('Resend sendMail POSTs to /emails with Bearer auth', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      status: 200,
      json: async () => ({ id: 'msg_test_123' }),
    };
  };
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_send_test_key',
      MAIL_FROM: 'noreply@golab.cl',
    },
    () => withFetch(fakeFetch, async () => {
      mailer.invalidateCache();
      const result = await mailer.sendMail({
        to: 'client@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        text: 'Hi',
      });
      assert.equal(result.ok, true);
      assert.equal(result.provider, 'resend');
      assert.equal(result.messageId, 'msg_test_123');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.resend.com/emails');
      assert.equal(calls[0].opts.method, 'POST');
      assert.equal(calls[0].opts.headers.Authorization, 'Bearer re_send_test_key');
      const body = JSON.parse(calls[0].opts.body);
      assert.deepEqual(body.to, ['client@example.com']);
      assert.equal(body.from, 'noreply@golab.cl');
      assert.equal(body.subject, 'Test');
    }),
  );
});

test('Resend verifyConnection GETs /domains', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, method: opts.method });
    return { status: 200, json: async () => ({ data: [] }) };
  };
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_verify_key',
      MAIL_FROM: 'noreply@golab.cl',
    },
    () => withFetch(fakeFetch, async () => {
      mailer.invalidateCache();
      const result = await mailer.verifyConnection();
      assert.equal(result.verified, true);
      assert.equal(result.provider, 'resend');
      assert.equal(calls[0].url, 'https://api.resend.com/domains');
      assert.equal(calls[0].method, 'GET');
    }),
  );
});

test('Resend sendMail classifies 401 as auth_failed', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  const fakeFetch = async () => ({
    status: 401,
    json: async () => ({ message: 'Invalid API key' }),
  });
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_bad_key',
      MAIL_FROM: 'noreply@golab.cl',
    },
    () => withFetch(fakeFetch, async () => {
      mailer.invalidateCache();
      const result = await mailer.sendMail({
        to: 'x@example.com',
        subject: 'X',
        html: 'X',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'auth_failed');
      assert.equal(result.status, 401);
      assert.equal(result.provider, 'resend');
    }),
  );
});

test('Resend sendMail classifies 422 with domain message as domain_unverified', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  const fakeFetch = async () => ({
    status: 422,
    json: async () => ({ message: 'The from address contains an invalid domain' }),
  });
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'noreply@unverified.cl',
    },
    () => withFetch(fakeFetch, async () => {
      mailer.invalidateCache();
      const result = await mailer.sendMail({ to: 'x@example.com', subject: 'X', html: 'X' });
      assert.equal(result.reason, 'domain_unverified');
    }),
  );
});

test('missing "to" short-circuits before transport call', async () => {
  const mailer = loadMailerWithStubs({ dbRows: [] });
  let fetchCalled = false;
  const fakeFetch = async () => { fetchCalled = true; return { status: 200, json: async () => ({}) }; };
  await withEnv(
    {
      MAIL_PROVIDER: undefined,
      RESEND_API_KEY: 're_test',
      MAIL_FROM: 'noreply@golab.cl',
    },
    () => withFetch(fakeFetch, async () => {
      mailer.invalidateCache();
      const result = await mailer.sendMail({ to: '', subject: 'X', html: 'X' });
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'missing_to');
      assert.equal(fetchCalled, false);
    }),
  );
});
