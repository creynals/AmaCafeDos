const express = require('express');
const { query } = require('../models/database');
const { hashPassword } = require('../utils/auth');

const router = express.Router();

// GET /api/admin/users - List all admin users
router.get('/admin/users', async (req, res) => {
  const { rows } = await query(`
    SELECT id, username, display_name, role, active, created_at, updated_at
    FROM admin_users
    ORDER BY created_at ASC
  `);
  res.json(rows);
});

// POST /api/admin/users - Create new admin user
router.post('/admin/users', async (req, res) => {
  const { username, password, display_name, role } = req.body;

  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const validRoles = ['admin', 'superadmin'];
  const userRole = validRoles.includes(role) ? role : 'admin';

  const { rows: existing } = await query('SELECT id FROM admin_users WHERE username = $1', [username.trim().toLowerCase()]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'El nombre de usuario ya existe' });
  }

  const passwordHash = hashPassword(password);
  const { rows } = await query(`
    INSERT INTO admin_users (username, password_hash, display_name, role)
    VALUES ($1, $2, $3, $4) RETURNING id
  `, [username.trim().toLowerCase(), passwordHash, display_name.trim(), userRole]);

  res.json({
    success: true,
    user: {
      id: rows[0].id,
      username: username.trim().toLowerCase(),
      display_name: display_name.trim(),
      role: userRole,
      active: 1,
    },
  });
});

// PUT /api/admin/users/:id - Update user (display_name, role, active)
router.put('/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { display_name, role, active } = req.body;
  const currentUser = req.authUser;

  const { rows: userRows } = await query('SELECT * FROM admin_users WHERE id = $1', [id]);
  const user = userRows[0];
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Prevent deactivating own account
  if (currentUser.user_id === user.id && active === 0) {
    return res.status(400).json({ error: 'No puede desactivar su propia cuenta' });
  }

  const updates = [];
  const params = [];
  let idx = 1;

  if (display_name !== undefined) {
    updates.push(`display_name = $${idx++}`);
    params.push(display_name.trim());
  }
  if (role !== undefined && ['admin', 'superadmin'].includes(role)) {
    updates.push(`role = $${idx++}`);
    params.push(role);
  }
  if (active !== undefined) {
    updates.push(`active = $${idx++}`);
    params.push(active ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No hay datos para actualizar' });
  }

  updates.push('updated_at = NOW()');
  params.push(id);

  await query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  // If deactivated, kill their sessions
  if (active === 0) {
    await query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);
  }

  const { rows: updated } = await query('SELECT id, username, display_name, role, active, created_at, updated_at FROM admin_users WHERE id = $1', [id]);
  res.json({ success: true, user: updated[0] });
});

// PUT /api/admin/users/:id/password - Change password
router.put('/admin/users/:id/password', async (req, res) => {
  const { id } = req.params;
  const { password, current_password } = req.body;
  const currentUser = req.authUser;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const { rows: userRows } = await query('SELECT * FROM admin_users WHERE id = $1', [id]);
  const user = userRows[0];
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // If changing own password, require current password
  if (currentUser.user_id === user.id) {
    if (!current_password) {
      return res.status(400).json({ error: 'Debe ingresar su contraseña actual' });
    }
    const { verifyPassword } = require('../utils/auth');
    if (!verifyPassword(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
  }

  const passwordHash = hashPassword(password);
  await query('UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, id]);

  // Invalidate all sessions for this user (force re-login)
  await query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);

  res.json({ success: true, message: 'Contraseña actualizada correctamente' });
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const currentUser = req.authUser;

  if (currentUser.user_id === Number(id)) {
    return res.status(400).json({ error: 'No puede eliminar su propia cuenta' });
  }

  const { rows } = await query('SELECT id FROM admin_users WHERE id = $1', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // Delete sessions first, then user
  await query('DELETE FROM auth_sessions WHERE user_id = $1', [id]);
  await query('DELETE FROM admin_users WHERE id = $1', [id]);

  res.json({ success: true, message: 'Usuario eliminado correctamente' });
});

module.exports = router;
