// encryption-health.js — C190 unified diagnostic for AES-256-GCM settings.
//
// Surfaces decryptOk per key so an admin can tell which encrypted rows need
// re-saving after an ENCRYPTION_SECRET rotation. Closes the diagnostic gap
// observed in C189 prod log (3x "Decryption failed" with no UI surface).
//
// Reports a short hash of the active secret so the user can verify it matches
// expectations without exposing the value itself.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../models/database');
const { decrypt } = require('../utils/crypto');

const router = express.Router();

// Keys that store ciphertext under AES-256-GCM via crypto.js / keyManager.
// Order is meaningful for the UI (most-blast-radius first).
const ENCRYPTED_KEYS = [
  { key: 'smtp_pass',           label: 'Contraseña SMTP',         consumer: 'mailer (envíos de correo)' },
  { key: 'sumup_api_key',       label: 'API Key SumUp',           consumer: 'checkout (pagos)' },
  { key: 'recaptcha_secret_key', label: 'Secret Key reCAPTCHA',    consumer: 'chat público (validación bot)' },
  { key: 'openrouter_api_key',  label: 'API Key OpenRouter',      consumer: 'admin chat (asesor IA)' },
];

function fingerprintSecret() {
  const secret = process.env.ENCRYPTION_SECRET || '';
  if (!secret) return { present: false, fingerprint: null };
  // SHA-256 truncado a 8 hex chars — suficiente para que el usuario distinga
  // entre dos secretos sin revelar nada explotable.
  const hash = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 8);
  return { present: true, fingerprint: hash };
}

async function probeKey({ key, label, consumer }) {
  const { rows } = await query(
    'SELECT value, updated_at FROM settings WHERE key = $1',
    [key],
  );
  if (rows.length === 0 || !rows[0].value) {
    return {
      key,
      label,
      consumer,
      present: false,
      decryptOk: null,
      updatedAt: null,
    };
  }
  const plain = decrypt(rows[0].value);
  return {
    key,
    label,
    consumer,
    present: true,
    decryptOk: plain != null && plain !== '',
    updatedAt: rows[0].updated_at,
  };
}

router.get('/admin/encryption-health', async (req, res) => {
  const secretInfo = fingerprintSecret();
  const results = await Promise.all(ENCRYPTED_KEYS.map(probeKey));

  const failing = results.filter((r) => r.present && r.decryptOk === false);
  const healthy = results.filter((r) => r.present && r.decryptOk === true);
  const absent = results.filter((r) => !r.present);

  res.json({
    secret: {
      configured: secretInfo.present,
      fingerprint: secretInfo.fingerprint,
    },
    summary: {
      total: results.length,
      configured: healthy.length + failing.length,
      healthy: healthy.length,
      failing: failing.length,
      absent: absent.length,
    },
    keys: results,
    actionRequired: failing.length > 0
      ? failing.map((k) => `Re-grabar "${k.label}" en /admin → Configuración (consumer: ${k.consumer})`)
      : [],
  });
});

module.exports = router;
