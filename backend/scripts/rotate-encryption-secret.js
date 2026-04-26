#!/usr/bin/env node
// Rotación de ENCRYPTION_SECRET
//
// Uso:
//   OLD_ENCRYPTION_SECRET=<viejo> NEW_ENCRYPTION_SECRET=<nuevo> \
//     node backend/scripts/rotate-encryption-secret.js [--apply]
//
// Sin --apply: dry-run (lista qué se re-cifraría, no escribe nada).
// Con --apply: descifra cada setting cifrada con OLD, re-cifra con NEW y
// hace UPDATE en la tabla settings dentro de una transacción.
//
// Tras correr con --apply: actualizar backend/.env con NEW_ENCRYPTION_SECRET
// y reiniciar el backend.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { Pool } = require('pg');

const ENCRYPTED_KEYS = ['sumup_api_key', 'sumup_merchant_code', 'recaptcha_secret_key'];

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function deriveKey(secret) {
  return crypto.scryptSync(secret, 'amacafe-salt', KEY_LENGTH);
}

function encryptWith(secret, plainText) {
  if (!plainText) return null;
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decryptWith(secret, encryptedText) {
  if (!encryptedText) return null;
  const key = deriveKey(secret);
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  const oldSecret = process.env.OLD_ENCRYPTION_SECRET;
  const newSecret = process.env.NEW_ENCRYPTION_SECRET;
  const apply = process.argv.includes('--apply');

  if (!oldSecret || !newSecret) {
    console.error('ERROR: Faltan OLD_ENCRYPTION_SECRET y/o NEW_ENCRYPTION_SECRET en env');
    process.exit(1);
  }
  if (oldSecret === newSecret) {
    console.error('ERROR: OLD y NEW son iguales — no hay rotación');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL no definido');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  console.log(`[rotate] mode = ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`[rotate] keys cifradas a procesar: ${ENCRYPTED_KEYS.join(', ')}`);

  const reEncrypted = [];
  const skipped = [];

  try {
    if (apply) await client.query('BEGIN');

    for (const key of ENCRYPTED_KEYS) {
      const { rows } = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
      if (rows.length === 0 || !rows[0].value) {
        skipped.push({ key, reason: 'no row / empty' });
        continue;
      }

      let plain;
      try {
        plain = decryptWith(oldSecret, rows[0].value);
      } catch (err) {
        console.error(`[rotate] FAIL decrypt key=${key} con OLD: ${err.message}`);
        if (apply) await client.query('ROLLBACK');
        process.exit(2);
      }

      if (plain === null || plain === undefined) {
        skipped.push({ key, reason: 'decrypt returned null' });
        continue;
      }

      const reEnc = encryptWith(newSecret, plain);
      reEncrypted.push({ key, plainPreview: plain.slice(0, 4) + '…' + plain.slice(-2) });

      if (apply) {
        await client.query(
          'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
          [reEnc, key]
        );
      }
    }

    if (apply) await client.query('COMMIT');
  } catch (err) {
    if (apply) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n=== RESUMEN ===');
  console.log('Re-cifrados:');
  for (const r of reEncrypted) console.log(`  - ${r.key}  (preview=${r.plainPreview})`);
  console.log('Saltados:');
  for (const s of skipped) console.log(`  - ${s.key}  (${s.reason})`);
  console.log(apply ? '\n[OK] Rotación aplicada. Actualiza backend/.env con NEW_ENCRYPTION_SECRET y reinicia.' : '\n[DRY-RUN] Volver a correr con --apply para escribir cambios.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
