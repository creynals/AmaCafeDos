// crypto.js — Wrapper de runtime sobre keyManager (Cycle 82, OPTION B).
//
// Lee el secret desde process.env.ENCRYPTION_SECRET (con fallback de dev) y
// delega toda la lógica criptográfica al módulo compartido keyManager.
// Preserva la API pública { encrypt, decrypt } usada por routes/settings.js.

const { encryptWithSecret, decryptWithSecret } = require('./keyManager');

const DEFAULT_DEV_SECRET = 'amacafe-default-secret-key-2026';

function currentSecret() {
  return process.env.ENCRYPTION_SECRET || DEFAULT_DEV_SECRET;
}

function encrypt(plainText) {
  return encryptWithSecret(currentSecret(), plainText);
}

function decrypt(encryptedText) {
  try {
    return decryptWithSecret(currentSecret(), encryptedText);
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
