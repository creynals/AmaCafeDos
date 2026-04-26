const crypto = require('crypto');
const { query } = require('../models/database');

// Password hashing with scrypt
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

// Session management
const SESSION_DURATION_HOURS = 8;

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();

  // Clean expired sessions
  await query('DELETE FROM auth_sessions WHERE expires_at < NOW()');

  await query('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expiresAt]);
  return { token, expiresAt };
}

async function validateSession(token) {
  if (!token) return null;
  const { rows } = await query(`
    SELECT s.token, s.user_id, s.expires_at, u.username, u.display_name, u.role
    FROM auth_sessions s
    JOIN admin_users u ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at > NOW() AND u.active = 1
  `, [token]);
  return rows[0] || null;
}

async function destroySession(token) {
  await query('DELETE FROM auth_sessions WHERE token = $1', [token]);
}

// Simple SVG CAPTCHA
const captchaStore = new Map();

function generateCaptcha() {
  const id = crypto.randomBytes(16).toString('hex');
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const operators = ['+', '-', '×'];
  const op = operators[Math.floor(Math.random() * 3)];

  let answer;
  let question;
  if (op === '+') {
    answer = num1 + num2;
    question = `${num1} + ${num2}`;
  } else if (op === '-') {
    const a = Math.max(num1, num2);
    const b = Math.min(num1, num2);
    answer = a - b;
    question = `${a} - ${b}`;
  } else {
    answer = num1 * num2;
    question = `${num1} × ${num2}`;
  }

  // Store with 5 min expiry
  captchaStore.set(id, { answer: String(answer), expires: Date.now() + 5 * 60 * 1000 });

  // Cleanup old captchas
  for (const [key, val] of captchaStore) {
    if (val.expires < Date.now()) captchaStore.delete(key);
  }

  // Generate SVG with visual noise
  const width = 200;
  const height = 70;
  const chars = question.split('').concat([' ', '=', ' ', '?']);

  let noiseLines = '';
  for (let i = 0; i < 5; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    const color = `hsl(${Math.random() * 360}, 40%, 50%)`;
    noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" opacity="0.4"/>`;
  }

  let noiseDots = '';
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const color = `hsl(${Math.random() * 360}, 40%, 50%)`;
    noiseDots += `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${color}" opacity="0.5"/>`;
  }

  let textElements = '';
  const startX = 20;
  chars.forEach((char, i) => {
    const x = startX + i * 18;
    const y = 42 + (Math.random() * 10 - 5);
    const rotate = Math.random() * 20 - 10;
    const color = `hsl(${30 + Math.random() * 20}, 80%, ${60 + Math.random() * 15}%)`;
    textElements += `<text x="${x}" y="${y}" font-family="monospace" font-size="24" font-weight="bold" fill="${color}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#1a1a2e" rx="8"/>
    ${noiseLines}
    ${noiseDots}
    ${textElements}
  </svg>`;

  const svgBase64 = Buffer.from(svg).toString('base64');

  return { id, image: `data:image/svg+xml;base64,${svgBase64}` };
}

function verifyCaptcha(id, answer) {
  const entry = captchaStore.get(id);
  if (!entry) return false;
  if (entry.expires < Date.now()) {
    captchaStore.delete(id);
    return false;
  }
  const valid = entry.answer === String(answer).trim();
  captchaStore.delete(id); // One-time use
  return valid;
}

// Ensure default admin exists
async function ensureDefaultAdmin() {
  const { rows } = await query('SELECT COUNT(*) as count FROM admin_users');
  const count = Number(rows[0].count);
  if (count === 0) {
    const hash = hashPassword('admin123');
    await query(`
      INSERT INTO admin_users (username, password_hash, display_name, role)
      VALUES ($1, $2, $3, $4)
    `, ['admin', hash, 'Administrador', 'superadmin']);
    console.log('Default admin user created (admin / admin123) — please change the password!');
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  generateCaptcha,
  verifyCaptcha,
  ensureDefaultAdmin,
};
