// keyManager.js — Módulo compartido de cifrado AES-256-GCM (Cycle 82, OPTION B).
//
// Exporta primitivas parametrizadas por secret para que tanto el runtime del
// backend (crypto.js) como el script de rotación (rotate-encryption-secret.js)
// usen la misma implementación. Elimina la duplicación reportada en C81.
//
// Decisiones (DG C81 OPTION B):
//   - Algoritmo y parámetros centralizados como constantes exportadas.
//   - deriveKey/encryptWithSecret/decryptWithSecret reciben `secret` explícito;
//     ningún fallback a defaults — la lógica de fallback queda en crypto.js.
//   - rotateValue compone decrypt(old) → encrypt(new) en una sola operación.
//   - Versioning de payload (prefijo v{N}:) queda fuera de alcance (OPTION C).

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT = 'amacafe-salt';

function deriveKey(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('keyManager.deriveKey: secret must be a non-empty string');
  }
  return crypto.scryptSync(secret, SALT, KEY_LENGTH);
}

function encryptWithSecret(secret, plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decryptWithSecret(secret, encryptedText) {
  if (!encryptedText) return null;
  const parts = String(encryptedText).split(':');
  if (parts.length !== 3) {
    throw new Error('keyManager.decryptWithSecret: malformed payload (expected iv:tag:cipher)');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const key = deriveKey(secret);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function rotateValue(oldSecret, newSecret, encryptedText) {
  if (!encryptedText) return null;
  const plain = decryptWithSecret(oldSecret, encryptedText);
  if (plain === null) return null;
  return encryptWithSecret(newSecret, plain);
}

module.exports = {
  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  SALT,
  deriveKey,
  encryptWithSecret,
  decryptWithSecret,
  rotateValue,
};
