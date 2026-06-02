// Autocompletar datos del cliente en checkout vía código por email (C205).
//
// Rutas PÚBLICAS (storefront, sin auth) — deben montarse ANTES del requireAuth
// global en server.js, igual que orders/cart.
//
// Seguridad:
//   - request-code responde SIEMPRE genérico (anti-enumeración): no revela si
//     el email existe como cliente.
//   - Solo se envía email si el cliente existe; el código es de un solo uso,
//     expira, limita intentos y se guarda hasheado (ver checkoutVerification).
//   - Rate-limit por IP (middleware/security) + throttle por email (acá).

const express = require('express');
const mailer = require('../utils/mailer');
const { issueCode, verifyCode } = require('../utils/checkoutVerification');
const { buildCheckoutCodeEmail } = require('../utils/checkoutCodeEmail');
const {
  checkoutCodeRequestRateLimiter,
  checkoutCodeVerifyRateLimiter,
} = require('../middleware/security');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Throttle por email: 3 envíos / 15 min. Complementa el rate-limit por IP para
// que un atacante no spamee a una víctima rotando IPs. In-memory (best-effort).
const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_MAX = 3;
const emailHits = new Map();

function emailThrottled(email) {
  const now = Date.now();
  const recent = (emailHits.get(email) || []).filter((t) => now - t < EMAIL_WINDOW_MS);
  if (recent.length >= EMAIL_MAX) {
    emailHits.set(email, recent);
    return true;
  }
  recent.push(now);
  emailHits.set(email, recent);
  return false;
}

// POST /api/checkout/request-code  { email }
router.post('/checkout/request-code', checkoutCodeRequestRateLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  // Mensaje genérico — idéntico exista o no el cliente (anti-enumeración).
  const generic = { sent: true, message: 'Si tienes datos guardados, te enviamos un código a tu correo.' };

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (emailThrottled(email)) {
    return res.json(generic); // silencioso: no delata el throttle
  }

  try {
    const code = await issueCode(email);
    if (code) {
      const payload = buildCheckoutCodeEmail({ to: email, code });
      // fire-and-forget: el resultado del envío no se refleja en la respuesta.
      Promise.resolve()
        .then(() => mailer.sendMail(payload))
        .catch((err) => console.error('[checkout-autofill] send code failed:', err.message));
    }
  } catch (err) {
    console.error('[checkout-autofill] request-code error:', err.message);
  }

  return res.json(generic);
});

// POST /api/checkout/verify-code  { email, code }
router.post('/checkout/verify-code', checkoutCodeVerifyRateLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { code } = req.body || {};

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  try {
    const result = await verifyCode(email, code);
    if (result.ok) {
      return res.json({
        verified: true,
        contact: result.data.contact,
        address: result.data.address,
      });
    }
    return res.status(400).json({
      verified: false,
      reason: result.reason,
      attemptsLeft: result.attemptsLeft,
    });
  } catch (err) {
    console.error('[checkout-autofill] verify-code error:', err.message);
    return res.status(500).json({ error: 'Error al verificar el código' });
  }
});

module.exports = router;
