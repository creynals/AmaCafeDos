// Ciclo 87 (R9) — bootstrapModeFromEnv tests.
// Run: node --test backend/src/utils/sumup.config.test.js
//
// We stub backend/src/models/database via require.cache so the helper can
// exercise its DB-touching paths without a live Postgres. Each test owns
// its own isolated module instance to keep cache state from leaking.

const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const DB_PATH = require.resolve('../models/database');
const CONFIG_PATH = require.resolve('./sumup.config');

function loadConfigWithStub(dbStub) {
  delete require.cache[CONFIG_PATH];
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: dbStub,
  };
  return require('./sumup.config');
}

function makeDb({ existingMode = null, throwOnSelect = false, throwOnUpsert = false } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) {
        if (throwOnSelect) throw new Error('boom-select');
        return existingMode === null ? { rows: [] } : { rows: [{ value: existingMode }] };
      }
      if (sql.startsWith('INSERT')) {
        if (throwOnUpsert) throw new Error('boom-upsert');
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
}

function withEnv(value, fn) {
  const prev = process.env.SUMUP_MODE;
  if (value === undefined) delete process.env.SUMUP_MODE;
  else process.env.SUMUP_MODE = value;
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env.SUMUP_MODE;
    else process.env.SUMUP_MODE = prev;
  });
}

test('env unset → no promotion (fast path)', async () => {
  const db = makeDb({ existingMode: 'mock' });
  const cfg = loadConfigWithStub(db);
  await withEnv(undefined, async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.deepEqual(r, { promoted: false, reason: 'env-unset' });
    assert.equal(db.calls.length, 0, 'must not touch DB when env is empty');
  });
});

test('env set to invalid value → no promotion, reason env-invalid', async () => {
  const db = makeDb({ existingMode: 'mock' });
  const cfg = loadConfigWithStub(db);
  await withEnv('garbage', async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.equal(r.promoted, false);
    assert.equal(r.reason, 'env-invalid');
    assert.equal(r.envValue, 'garbage');
    assert.equal(db.calls.length, 0);
  });
});

test('env=live and DB=mock → promotes, returns from/to', async () => {
  const db = makeDb({ existingMode: 'mock' });
  const cfg = loadConfigWithStub(db);
  await withEnv('live', async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.deepEqual(r, { promoted: true, from: 'mock', to: 'live' });
    assert.equal(db.calls.length, 2, 'one SELECT + one UPSERT');
    assert.match(db.calls[1].sql, /^INSERT INTO settings/);
    assert.deepEqual(db.calls[1].params, ['live']);
  });
});

test('env=live and DB=live → no promotion (already-in-sync)', async () => {
  const db = makeDb({ existingMode: 'live' });
  const cfg = loadConfigWithStub(db);
  await withEnv('live', async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.deepEqual(r, { promoted: false, reason: 'already-in-sync', value: 'live' });
    assert.equal(db.calls.length, 1, 'only the SELECT, no UPSERT');
  });
});

test('env=live and DB row missing → promotes from null', async () => {
  const db = makeDb({ existingMode: null });
  const cfg = loadConfigWithStub(db);
  await withEnv('live', async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.equal(r.promoted, true);
    assert.equal(r.from, null);
    assert.equal(r.to, 'live');
  });
});

test('UPSERT failure → promoted=false, reason db-error', async () => {
  const db = makeDb({ existingMode: 'mock', throwOnUpsert: true });
  const cfg = loadConfigWithStub(db);
  await withEnv('live', async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.equal(r.promoted, false);
    assert.equal(r.reason, 'db-error');
    assert.equal(r.error, 'boom-upsert');
  });
});

test('whitespace-only env value treated as unset', async () => {
  const db = makeDb({ existingMode: 'mock' });
  const cfg = loadConfigWithStub(db);
  await withEnv('   ', async () => {
    const r = await cfg.bootstrapModeFromEnv();
    assert.equal(r.promoted, false);
    assert.equal(r.reason, 'env-unset');
    assert.equal(db.calls.length, 0);
  });
});

test('promotion invalidates the in-proc mode cache', async () => {
  // Stateful stub: UPSERT mutates the value the next SELECT returns,
  // mirroring real DB behaviour so we can verify the cache was actually
  // dropped (not just refilled with the old value).
  let stored = 'mock';
  const stub = {
    query: async (sql, params) => {
      if (sql.startsWith('SELECT')) return { rows: [{ value: stored }] };
      if (sql.startsWith('INSERT')) {
        stored = params[0];
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
  const cfg = loadConfigWithStub(stub);
  await withEnv('live', async () => {
    const before = await cfg.getModeWithSource();
    assert.equal(before.value, 'mock', 'sanity: starts on mock');

    const r = await cfg.bootstrapModeFromEnv();
    assert.equal(r.promoted, true);

    const after = await cfg.getModeWithSource();
    assert.equal(after.value, 'live', 'cache must have been invalidated');
    assert.equal(after.source, 'settings');
  });
});

// Cleanup: restore real database module so other test files in the same
// `node --test` invocation don't inherit our stub.
test.after(() => {
  delete require.cache[DB_PATH];
  delete require.cache[CONFIG_PATH];
});
