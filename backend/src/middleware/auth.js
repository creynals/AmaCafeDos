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

function requireSuperAdmin(req, res, next) {
  if (req.authUser?.role !== 'superadmin') {
    return res.status(403).json({ error: 'No tiene permisos para esta acción' });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
