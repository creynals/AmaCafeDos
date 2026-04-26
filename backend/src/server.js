require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initSchema, closeDatabase } = require('./models/database');
const { requireAuth } = require('./middleware/auth');
const { ensureDefaultAdmin } = require('./utils/auth');
const { getModeWithSource, getReturnUrlBaseWithSource } = require('./utils/sumup.config');
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

const app = express();
const PORT = process.env.PORT || 7000;

// Middleware
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

// Serve static files (product images, etc.)
app.use('/static', express.static(path.join(__dirname, '..', '..', 'fuentes')));

// Health check
app.use('/api/health', (req, res) => {
  res.json({ status: 'ok', project: 'AMA Café API', version: '1.0.0', database: 'PostgreSQL' });
});

// Public API Routes
app.use('/api', productRoutes);
app.use('/api', cartRoutes);
app.use('/api', orderRoutes);
app.use('/api', paymentsRoutes);
app.use('/api', chatRoutes);
app.use('/api', authRoutes);

// Protected Admin Routes (require authentication)
app.use('/api', requireAuth, adminRoutes);
app.use('/api', requireAuth, adminProductsRoutes);
app.use('/api', requireAuth, adminProductsCrudRoutes);
app.use('/api', requireAuth, adminProductsImagesRoutes);
app.use('/api', requireAuth, adminChatRoutes);
app.use('/api', requireAuth, settingsRoutes);
app.use('/api', requireAuth, usersRoutes);

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
