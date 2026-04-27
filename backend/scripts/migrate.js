#!/usr/bin/env node
/**
 * C84 (B4): Standalone migration runner para Railway preDeploy / CI.
 *
 * Ejecuta initSchema() (idempotente: CREATE TABLE IF NOT EXISTS) seguido por
 * runMigrations() (aplica todos los .sql de backend/src/migrations en orden).
 *
 * Diferencia con server.js:
 *   - server.js corre initSchema dentro de start() y luego abre el listen.
 *   - Este script SOLO aplica el esquema y termina (exit 0/1).
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node backend/scripts/migrate.js
 *
 * En Railway se usa como `preDeployCommand` en railway.toml — corre antes de
 * que el nuevo contenedor tome tráfico, evitando que el listener arranque
 * contra una BD aún sin migrar.
 *
 * IMPORTANTE: las migraciones existentes (001-014) están escritas con
 * IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, por lo que volver a correr este
 * script sobre una BD ya migrada es seguro (idempotencia verificada).
 */

require('dotenv').config();
const { initSchema, closeDatabase } = require('../src/models/database');

async function main() {
  const start = Date.now();
  console.log('[migrate] Starting schema init + migrations...');
  console.log(`[migrate] DATABASE_URL=${process.env.DATABASE_URL ? '<set>' : '<unset, using default localhost>'}`);

  await initSchema();

  const elapsed = Date.now() - start;
  console.log(`[migrate] OK — schema and migrations applied in ${elapsed}ms`);
}

main()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[migrate] FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    try { await closeDatabase(); } catch { /* ignore */ }
    process.exit(1);
  });
