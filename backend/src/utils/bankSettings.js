// Bank-account settings for transferencia payment method — Cycle 180
//
// Persiste 6 claves planas en la tabla `settings` (sin cifrado: son datos
// que se muestran en el email al cliente, no son secretos):
//   bank_holder_rut    — RUT del titular (formato 12.345.678-5)
//   bank_holder_name   — Nombre del titular
//   bank_account_type  — Tipo de cuenta (whitelist)
//   bank_account_number — Número de cuenta
//   bank_name          — Banco (whitelist)
//   bank_holder_email  — Email del titular (opcional, para CC al admin)
//
// Whitelists derivadas del catálogo SBIF/CMF chileno + tipos de cuenta más
// usados. `other` permite cubrir bancos digitales nuevos sin tocar código.

const { query } = require('../models/database');

const BANK_KEYS = {
  holderRut:     'bank_holder_rut',
  holderName:    'bank_holder_name',
  accountType:   'bank_account_type',
  accountNumber: 'bank_account_number',
  bankName:      'bank_name',
  holderEmail:   'bank_holder_email',
};

const ACCOUNT_TYPES = {
  corriente: 'Cuenta Corriente',
  vista:     'Cuenta Vista',
  ahorro:    'Cuenta de Ahorro',
  rut:       'CuentaRUT',
  chequera:  'Chequera Electrónica',
};

const BANK_NAMES = {
  chile:         'Banco de Chile',
  estado:        'BancoEstado',
  santander:     'Banco Santander',
  bci:           'BCI',
  itau:          'Itaú',
  scotiabank:    'Scotiabank',
  internacional: 'Banco Internacional',
  bice:          'Banco BICE',
  falabella:     'Banco Falabella',
  security:      'Banco Security',
  consorcio:     'Banco Consorcio',
  ripley:        'Banco Ripley',
  hsbc:          'HSBC',
  mercado_pago:  'Mercado Pago',
  tenpo:         'Tenpo',
  mach:          'MACH',
  other:         'Otro',
};

async function readBankKey(key) {
  const { rows } = await query('SELECT value, updated_at FROM settings WHERE key = $1', [key]);
  if (rows.length === 0) return { value: null, updatedAt: null };
  return { value: rows[0].value || null, updatedAt: rows[0].updated_at };
}

async function writeBankKey(key, value) {
  await query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()
  `, [key, value]);
}

async function readBankSettings() {
  const [rut, holder, type, number, bank, email] = await Promise.all([
    readBankKey(BANK_KEYS.holderRut),
    readBankKey(BANK_KEYS.holderName),
    readBankKey(BANK_KEYS.accountType),
    readBankKey(BANK_KEYS.accountNumber),
    readBankKey(BANK_KEYS.bankName),
    readBankKey(BANK_KEYS.holderEmail),
  ]);

  const accountTypeKey = type.value;
  const bankNameKey = bank.value;

  return {
    holderRut:        rut.value,
    holderName:       holder.value,
    accountTypeKey:   accountTypeKey,
    accountTypeLabel: accountTypeKey ? (ACCOUNT_TYPES[accountTypeKey] || accountTypeKey) : null,
    accountNumber:    number.value,
    bankKey:          bankNameKey,
    bankLabel:        bankNameKey ? (BANK_NAMES[bankNameKey] || bankNameKey) : null,
    holderEmail:      email.value,
    updatedAt: [rut.updatedAt, holder.updatedAt, type.updatedAt, number.updatedAt, bank.updatedAt, email.updatedAt]
      .filter(Boolean)
      .sort()
      .pop() || null,
  };
}

function isBankConfigured(bank) {
  return !!(bank
    && bank.holderRut
    && bank.holderName
    && bank.accountTypeKey
    && bank.accountNumber
    && bank.bankKey);
}

module.exports = {
  BANK_KEYS,
  ACCOUNT_TYPES,
  BANK_NAMES,
  readBankKey,
  writeBankKey,
  readBankSettings,
  isBankConfigured,
};
