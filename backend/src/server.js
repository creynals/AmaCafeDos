require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initSchema, closeDatabase } = require('./models/database');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { validateInput } = require('./middleware/validateInput');
const { ensureDefaultAdmin } = require('./utils/auth');
const { getModeWithSource, getReturnUrlBaseWithSource, bootstrapModeFromEnv } = require('./utils/sumup.config');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const chatRoutes = require('./routes/chat');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminProductsRoutes = require('./routes/products-admin');
const adminProductsCrudRoutes = require('./routes/products-admin-crud');
const adminProductsImagesRoutes = require('./routes/products-admin-images');
const adminChatRoutes = require('./routes/admin-chat');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhooks');
const { getRecaptchaConfig } = require('./utils/recaptcha');
const { IMAGES_DIR, ensureImagesDir } = require('./utils/imageStorage');

const app = express();
const PORT = process.env.PORT || 7000;

// Middleware

// helmet — headers de seguridad. CSP whitelist: SumUp (gateway) + reCAPTCHA
// (google + gstatic). crossOriginResourcePolicy en "cross-origin" para que el
// frontend (Vite/cloudflared) pueda cargar /static/* (imágenes de productos).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'",
        'https://gateway.sumup.com',
        'https://www.google.com',
        'https://www.gstatic.com',
        'https://www.recaptcha.net',
      ],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': [
        "'self'",
        'https://api.sumup.com',
        'https://gateway.sumup.com',
        'https://www.google.com',
      ],
      'frame-src': [
        "'self'",
        'https://gateway.sumup.com',
        'https://www.google.com',
        'https://www.recaptcha.net',
      ],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Webhooks MUST be registered BEFORE express.json() so the route handler's
// express.raw() middleware receives the raw body as a Buffer. The handler
// computes event_id = sha256(rawBody) for idempotency dedup (Capa B en
// payment_events). Ciclo 25/26: HMAC verification was removed entirely —
// raw body is now needed only for the sha256 fingerprint, not signature check.
app.use('/', webhookRoutes);

app.use(express.json());

// Serve static files.
//
// C85 (B2 — Railway Volume): product images live in IMAGES_DIR, which is
// IMAGES_STORAGE_PATH in production (Railway volume mount, e.g. /data/products)
// and the in-repo `fuentes/products` directory locally. The `/static/products`
// mount comes BEFORE the broader `/static` mount so volume contents win over
// the bundled fallback in the repo. The remaining `/static` paths (menu/, logo)
// continue to be served from the repo's `fuentes/` directory unchanged.
ensureImagesDir();
app.use('/static/products', express.static(IMAGES_DIR));
app.use('/static', express.static(path.join(__dirname, '..', '..', 'fuentes')));

// Health check
app.use('/api/health', (req, res) => {
  res.json({ status: 'ok', project: 'AMA Café API', version: '1.0.0', database: 'PostgreSQL' });
});

// Cycle 101 (OPTION B): central input hardening guard. Inspects req.body /
// req.query / req.params for SQLi / XSS / NoSQL payload shapes and
// string-length DoS. Mounted AFTER express.json() so the body is parsed.
// /api/chat is registered BEFORE the guard so its existing chatInputSanitizer
// (silent HTML strip) keeps working — rejecting loudly there would break
// legitimate user messages that happen to contain "<3" or similar tokens.
// Webhooks bypass implicitly (registered earlier with raw body).
app.use('/api', chatRoutes);
app.use('/api', validateInput());

// Public API Routes (post-guard)
app.use('/api', productRoutes);
app.use('/api', cartRoutes);
app.use('/api', orderRoutes);
app.use('/api', paymentsRoutes);
app.use('/api', authRoutes);

// Public reCAPTCHA config — must register BEFORE the requireAuth-protected
// settingsRoutes mount below, otherwise the global requireAuth swallows it
// and unauthenticated guests can't fetch the site key, breaking chat tokens.
app.get('/api/settings/recaptcha-config', async (req, res) => {
  const config = await getRecaptchaConfig();
  res.json({
    enabled: config.enabled,
    siteKey: config.siteKey || null,
  });
});

// Protected Admin Routes — requireAuth (sesión válida) + requireAdmin (rol
// admin|superadmin). Defense in depth: aunque hoy todos los usuarios creados
// son admin/superadmin, requireAdmin previene escalada si en el futuro se
// agregan roles tipo "viewer" o "kitchen".
app.use('/api', requireAuth, requireAdmin, adminRoutes);
app.use('/api', requireAuth, requireAdmin, adminProductsRoutes);
app.use('/api', requireAuth, requireAdmin, adminProductsCrudRoutes);
app.use('/api', requireAuth, requireAdmin, adminProductsImagesRoutes);
app.use('/api', requireAuth, requireAdmin, adminChatRoutes);
app.use('/api', requireAuth, requireAdmin, settingsRoutes);
app.use('/api', requireAuth, requireAdmin, usersRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Ciclo 41 (Option B — Hardening con Failsafes):
// Resuelve sumup_mode al arrancar, loguea modo efectivo + source y aborta
// si NODE_ENV=production con modo=mock (failsafe S00_preflight §7).
// No bloquea startup si la BD está temporalmente inaccesible — degrada al
// fallback de env/default con warn visible.
async function logAndValidateSumupConfig() {
  // Ciclo 87 (R9): one-shot env -> settings promotion BEFORE we resolve the
  // effective mode, so a fresh prod deploy with SUMUP_MODE=live in the
  // Railway env vars boots cleanly instead of tripping the mock failsafe.
  const promotion = await bootstrapModeFromEnv();
  if (promotion.promoted) {
    console.log(`[sumup] bootstrap: promoted SUMUP_MODE env to settings (was='${promotion.from ?? 'unset'}', now='${promotion.to}')`);
  } else if (promotion.reason === 'env-invalid') {
    console.warn(`[sumup] bootstrap: ignoring invalid SUMUP_MODE env value '${promotion.envValue}' (allowed: mock|live)`);
  } else if (promotion.reason === 'db-error') {
    console.warn(`[sumup] bootstrap: env promotion failed (${promotion.error}) — proceeding with current settings`);
  }

  const mode = await getModeWithSource();
  const returnUrl = await getReturnUrlBaseWithSource();

  console.log(`[sumup] mode=${mode.value} (source=${mode.source})`);
  if (returnUrl.value) {
    console.log(`[sumup] returnUrlBase=${returnUrl.value} (source=${returnUrl.source})`);
  } else {
    console.warn('[sumup] returnUrlBase=<unset> — configure via POST /admin/settings/sumup before issuing checkouts');
  }

  if (process.env.NODE_ENV === 'production' && mode.value === 'mock') {
    console.error('[sumup] FAILSAFE TRIGGERED: NODE_ENV=production with sumup_mode=mock');
    console.error('[sumup] Refusing to start — flip mode via POST /admin/settings/sumup {"mode":"live"} or unset NODE_ENV');
    process.exit(1);
  }
}

// Initialize database and start server
async function start() {
  await initSchema();
  await ensureDefaultAdmin();
  await logAndValidateSumupConfig();

  const server = app.listen(PORT, () => {
    console.log(`AMA Café API running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log('Database: PostgreSQL (db_taza_data)');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeDatabase();
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    closeDatabase();
    server.close(() => process.exit(0));
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
