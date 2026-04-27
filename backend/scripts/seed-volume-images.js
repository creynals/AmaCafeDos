#!/usr/bin/env node
/**
 * C85 (B2 — Railway Volume): bootstrap product images into the persistent
 * volume on first deploy.
 *
 * The repo bundles a small baseline of product images at
 * `<workspace>/fuentes/products/`. In Railway production, uploads land in the
 * mounted volume (IMAGES_STORAGE_PATH, typically `/data/products`). On the
 * very first boot the volume is empty, which would orphan every URL that
 * still points at the bundled images.
 *
 * This script runs in `preDeployCommand` after the DB migrations and copies
 * any baseline file that does NOT already exist in the destination. It is
 * idempotent — re-running it on subsequent deploys is a no-op once every
 * baseline file has been seeded.
 *
 * Behaviour:
 *   - If IMAGES_STORAGE_PATH is unset, this is a local/dev run; it logs and
 *     exits 0 (no copy needed — destination already IS the source).
 *   - If the source directory does not exist (e.g. `fuentes/products` wasn't
 *     bundled into the build), it logs a warning and exits 0; the running
 *     app will simply start with an empty gallery.
 *   - If a destination file already exists, it is left untouched (volume
 *     contents always win over the bundled baseline).
 */

const fs = require('fs');
const path = require('path');
const { IMAGES_DIR, LOCAL_DEFAULT_DIR, ensureImagesDir } = require('../src/utils/imageStorage');

function main() {
  const start = Date.now();

  if (IMAGES_DIR === LOCAL_DEFAULT_DIR) {
    console.log('[seed-volume-images] IMAGES_STORAGE_PATH unset — local/dev run, nothing to seed.');
    return;
  }

  console.log(`[seed-volume-images] Source: ${LOCAL_DEFAULT_DIR}`);
  console.log(`[seed-volume-images] Target: ${IMAGES_DIR}`);

  if (!fs.existsSync(LOCAL_DEFAULT_DIR)) {
    console.warn(`[seed-volume-images] Baseline source dir not present in build — skipping seed.`);
    ensureImagesDir();
    return;
  }

  ensureImagesDir();

  const entries = fs.readdirSync(LOCAL_DEFAULT_DIR, { withFileTypes: true });
  let copied = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const src = path.join(LOCAL_DEFAULT_DIR, entry.name);
    const dst = path.join(IMAGES_DIR, entry.name);

    if (fs.existsSync(dst)) {
      skipped++;
      continue;
    }

    fs.copyFileSync(src, dst);
    copied++;
  }

  const elapsed = Date.now() - start;
  console.log(`[seed-volume-images] OK — copied=${copied}, skipped=${skipped}, elapsed=${elapsed}ms`);
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error('[seed-volume-images] FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
}
