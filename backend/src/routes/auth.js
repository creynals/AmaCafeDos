const express = require('express');
const { query } = require('../models/database');
const {
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  generateCaptcha,
  verifyCaptcha,
} = require('../utils/auth');

const router = express.Router();

// Rate limiting for login attempts (per IP)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function checkLoginRate(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return true;
  if (Date.now() > entry.lockedUntil) {
    loginAttempts.delete(ip);
    return true;
  }
  return entry.attempts < MAX_ATTEMPTS;
}

function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const entry = loginAttempts.get(ip) || { attempts: 0, lockedUntil: 0 };
  entry.attempts++;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }
  loginAttempts.set(ip, entry);
}

// GET /api/auth/captcha - Generate new captcha
router.get('/auth/captcha', (req, res) => {
  const captcha = generateCaptcha();
  res.json(captcha);
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  const ip = req.ip;

  if (!checkLoginRate(ip)) {
    return res.status(429).json({
      error: `Demasiados intentos. Intente nuevamente en ${LOCKOUT_MINUTES} minutos.`,
    });
  }

  const { username, password, captcha_id, captcha_answer } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  if (!captcha_id || !captcha_answer) {
    return res.status(400).json({ error: 'Debe resolver el captcha' });
  }

  // Verify captcha first
  if (!verifyCaptcha(captcha_id, captcha_answer)) {
    return res.status(400).json({ error: 'Captcha incorrecto. Intente nuevamente.', captcha_invalid: true });
  }

  const { rows } = await query('SELECT * FROM admin_users WHERE username = $1 AND active = 1', [username.trim().toLowerCase()]);
  const user = rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginAttempt(ip, false);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  recordLoginAttempt(ip, true);
  const session = await createSession(user.id);

  res.json({
    success: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
  });
});

// POST /api/auth/logout
router.post('/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await destroySession(token);
  }
  res.json({ success: true });
});

// GET /api/auth/check - Validate current session
router.get('/auth/check', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = await validateSession(token);

  if (!session) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: {
      id: session.user_id,
      username: session.username,
      display_name: session.display_name,
      role: session.role,
    },
  });
});

module.exports = router;
