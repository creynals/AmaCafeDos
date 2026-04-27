// Tests for imageStorage util — C85 (B2 Railway Volume).
//
// IMAGES_DIR is resolved once at module load, so these tests target
// resolveImagesDir() directly to exercise the env-var resolution surface
// without juggling module cache state.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveImagesDir, LOCAL_DEFAULT_DIR } = require('./imageStorage');

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

test('resolveImagesDir falls back to LOCAL_DEFAULT_DIR when IMAGES_STORAGE_PATH is unset', () => {
  withEnv('IMAGES_STORAGE_PATH', undefined, () => {
    assert.equal(resolveImagesDir(), LOCAL_DEFAULT_DIR);
  });
});

test('resolveImagesDir treats empty/whitespace IMAGES_STORAGE_PATH as unset', () => {
  withEnv('IMAGES_STORAGE_PATH', '', () => {
    assert.equal(resolveImagesDir(), LOCAL_DEFAULT_DIR);
  });
  withEnv('IMAGES_STORAGE_PATH', '   ', () => {
    assert.equal(resolveImagesDir(), LOCAL_DEFAULT_DIR);
  });
});

test('resolveImagesDir returns absolute IMAGES_STORAGE_PATH verbatim', () => {
  withEnv('IMAGES_STORAGE_PATH', '/data/products', () => {
    assert.equal(resolveImagesDir(), '/data/products');
  });
});

test('resolveImagesDir rejects relative IMAGES_STORAGE_PATH', () => {
  withEnv('IMAGES_STORAGE_PATH', 'relative/path/products', () => {
    assert.throws(() => resolveImagesDir(), /absolute path/i);
  });
});

test('LOCAL_DEFAULT_DIR is an absolute path under the workspace', () => {
  assert.equal(path.isAbsolute(LOCAL_DEFAULT_DIR), true);
  assert.match(LOCAL_DEFAULT_DIR, /[\\/]fuentes[\\/]products$/);
});
