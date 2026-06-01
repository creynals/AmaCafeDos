// Chilean RUT (Rol Único Tributario) validator — Cycle 180
//
// Implements the modulo-11 check digit algorithm used by SII de Chile.
// Accepts inputs with dots/dashes/spaces ("12.345.678-5", "12345678-5",
// "12345678K", "123456785"). The check digit is case-insensitive and may be
// 'K' (representing 10).
//
// Public API:
//   normalizeRut(raw)  → "12345678-5" | null      (strip + reformat)
//   validateRut(raw)   → boolean                  (true iff DV matches)
//   formatRut(raw)     → "12.345.678-5" | null    (display form)

function cleanRut(raw) {
  if (raw == null) return '';
  return String(raw).toUpperCase().replace(/[.\s-]/g, '');
}

function computeDv(bodyDigits) {
  let sum = 0;
  let multiplier = 2;
  for (let i = bodyDigits.length - 1; i >= 0; i--) {
    sum += Number(bodyDigits[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return '0';
  if (mod === 10) return 'K';
  return String(mod);
}

function validateRut(raw) {
  const clean = cleanRut(raw);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  if (!/^[0-9K]$/.test(dv)) return false;
  if (body.length < 7 || body.length > 8) return false;
  return computeDv(body) === dv;
}

function normalizeRut(raw) {
  const clean = cleanRut(raw);
  if (!validateRut(clean)) return null;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

function formatRut(raw) {
  const normalized = normalizeRut(raw);
  if (!normalized) return null;
  const [body, dv] = normalized.split('-');
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}-${dv}`;
}

module.exports = {
  validateRut,
  normalizeRut,
  formatRut,
  computeDv,
};
