// Verificación de cliente para autocompletar datos en checkout (C205).
//
// Flujo: el cliente pide un código a su email → si es cliente conocido, se le
// envía un OTP de 6 dígitos (un solo uso, TTL corto) → al verificarlo se le
// devuelven sus datos guardados (nombre, teléfono y última dirección).
//
// El código es el control de seguridad contra fuga de PII: sin probar control
// del inbox, un email no puede recuperar los datos de ese cliente. Por eso:
//   - el código nunca se guarda en plano (SHA-256),
//   - expira y es de un solo uso,
//   - limita intentos,
//   - y las respuestas del endpoint son genéricas (anti-enumeración).

const crypto = require('crypto');
const { query } = require('../models/database');

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email == null ? '' : email).trim().toLowerCase();
}

function isValidCodeFormat(code) {
  return /^\d{6}$/.test(String(code == null ? '' : code).trim());
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Datos guardados del cliente: {contact:{name,email,phone}, address|null}.
// Devuelve null si el email no corresponde a un cliente.
async function getSavedCustomerData(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const { rows } = await query('SELECT id, name, phone FROM customers WHERE email = $1', [e]);
  if (!rows[0]) return null;
  const c = rows[0];

  const { rows: addrRows } = await query(
    `SELECT address_street, address_number, address_commune, address_city, address_notes
       FROM orders
      WHERE customer_id = $1 AND address_street IS NOT NULL AND address_street <> ''
      ORDER BY created_at DESC
      LIMIT 1`,
    [c.id],
  );
  const a = addrRows[0] || null;

  return {
    contact: { name: c.name || '', email: e, phone: c.phone || '' },
    address: a
      ? {
          street: a.address_street || '',
          number: a.address_number || '',
          commune: a.address_commune || '',
          city: a.address_city || 'Santiago',
          notes: a.address_notes || '',
        }
      : null,
  };
}

// Emite un código SOLO si el email es un cliente conocido. Invalida los códigos
// previos no usados del mismo email. Devuelve el código en claro (para enviarlo
// por email) o null si no hay cliente con ese email.
async function issueCode(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const saved = await getSavedCustomerData(e);
  if (!saved) return null;

  await query(
    'UPDATE customer_verification_codes SET used_at = now() WHERE email = $1 AND used_at IS NULL',
    [e],
  );

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await query(
    'INSERT INTO customer_verification_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)',
    [e, hashCode(code), expiresAt],
  );
  return code;
}

// Verifica el código más reciente del email. Devuelve:
//   { ok: true, data }                              — éxito (consume el código)
//   { ok: false, reason, attemptsLeft }             — fallo
async function verifyCode(email, code) {
  const e = normalizeEmail(email);
  if (!isValidCodeFormat(code)) {
    return { ok: false, reason: 'invalid_format', attemptsLeft: null };
  }

  const { rows } = await query(
    `SELECT id, code_hash, expires_at, attempts, used_at
       FROM customer_verification_codes
      WHERE email = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [e],
  );
  const rec = rows[0];
  if (!rec || rec.used_at) return { ok: false, reason: 'no_code', attemptsLeft: null };
  if (new Date(rec.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', attemptsLeft: 0 };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts', attemptsLeft: 0 };
  }

  const expected = Buffer.from(rec.code_hash, 'hex');
  const provided = Buffer.from(hashCode(String(code).trim()), 'hex');
  const match = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

  if (!match) {
    const { rows: upd } = await query(
      'UPDATE customer_verification_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [rec.id],
    );
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - upd[0].attempts);
    return { ok: false, reason: 'mismatch', attemptsLeft };
  }

  await query('UPDATE customer_verification_codes SET used_at = now() WHERE id = $1', [rec.id]);
  const data = await getSavedCustomerData(e);
  return { ok: true, data };
}

module.exports = {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  normalizeEmail,
  isValidCodeFormat,
  generateCode,
  hashCode,
  getSavedCustomerData,
  issueCode,
  verifyCode,
};
