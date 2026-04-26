const { validateSession } = require('../utils/auth');

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Debe iniciar sesión.' });
  }

  const session = await validateSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Sesión expirada o inválida. Inicie sesión nuevamente.' });
  }

  req.authUser = session;
  next();
}

// Roles válidos para acceder a /api/admin/* — superadmin hereda permisos de admin.
const ADMIN_ROLES = new Set(['admin', 'superadmin']);

function requireAdmin(req, res, next) {
  if (!req.authUser || !ADMIN_ROLES.has(req.authUser.role)) {
    return res.status(403).json({ error: 'Requiere rol administrativo' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.authUser?.role !== 'superadmin') {
    return res.status(403).json({ error: 'No tiene permisos para esta acción' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin };
