// Shared image storage location for product gallery + bulk upload routes.
//
// C85 (B2 — Railway Volume):
//   In Railway production, a persistent Volume is mounted (recommended at
//   `/data`) so uploaded product images survive container redeploys. Locally
//   we keep the legacy in-repo path `<workspace>/fuentes/products/`.
//
//   Resolution order:
//     1. process.env.IMAGES_STORAGE_PATH (absolute path) — set in Railway to
//        the products subdir of the mounted volume (e.g. `/data/products`).
//     2. Fallback: <workspaceRoot>/fuentes/products
//
//   Consumers MUST import { IMAGES_DIR, ensureImagesDir } from this module
//   instead of recomputing the path; this keeps server.js, products-admin.js
//   and products-admin-images.js aligned, and gives the seed script a single
//   destination to copy into.
//
//   Public URL convention is unchanged: every saved image is served at
//   `/static/products/<filename>`. server.js mounts `/static/products`
//   directly on this directory so the URL stays stable across local + prod.

const path = require('path');
const fs = require('fs');

const LOCAL_DEFAULT_DIR = path.join(__dirname, '..', '..', '..', 'fuentes', 'products');

function resolveImagesDir() {
  const fromEnv = process.env.IMAGES_STORAGE_PATH;
  if (fromEnv && fromEnv.trim()) {
    if (!path.isAbsolute(fromEnv)) {
      throw new Error(
        `[imageStorage] IMAGES_STORAGE_PATH must be an absolute path, got: ${fromEnv}`
      );
    }
    return fromEnv;
  }
  return LOCAL_DEFAULT_DIR;
}

const IMAGES_DIR = resolveImagesDir();

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

module.exports = {
  IMAGES_DIR,
  LOCAL_DEFAULT_DIR,
  ensureImagesDir,
  resolveImagesDir,
};
