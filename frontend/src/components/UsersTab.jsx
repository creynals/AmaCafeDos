import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Edit3, Trash2, Key, Shield, ShieldCheck, CheckCircle, AlertCircle, X, Loader2, Eye, EyeOff, Save } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

function UserModal({ user, onClose, onSaved }) {
  const { user: currentUser } = useAuth();
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    display_name: user?.display_name || '',
    password: '',
    role: user?.role || 'admin',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isEdit) {
        await api.updateUser(user.id, {
          display_name: form.display_name,
          role: form.role,
        });
      } else {
        if (!form.username.trim()) throw new Error('El usuario es requerido');
        if (!form.password || form.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
        await api.createUser({
          username: form.username.trim(),
          password: form.password,
          display_name: form.display_name.trim(),
          role: form.role,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-ama-card border border-ama-border rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-ama-text">
            {isEdit ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h3>
          <button onClick={onClose} className="text-ama-text-muted hover:text-ama-text">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={isEdit}
              placeholder="nombre_usuario"
              className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Nombre para mostrar</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Nombre completo"
              className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 pr-10 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ama-text-muted hover:text-ama-text">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Rol</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text focus:outline-none focus:border-ama-amber transition-colors"
            >
              <option value="admin">Administrador</option>
              <option value="superadmin">Super Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-ama-border rounded-xl text-sm text-ama-text-muted hover:text-ama-text transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-ama-amber hover:bg-ama-amber/90 text-ama-darker font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordModal({ user, onClose, onSaved }) {
  const { user: currentUser } = useAuth();
  const isSelf = currentUser?.id === user.id;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (isSelf && !currentPassword) {
      setError('Debe ingresar su contraseña actual');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(user.id, {
        password: newPassword,
        ...(isSelf ? { current_password: currentPassword } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-ama-card border border-ama-border rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-ama-text">
            Cambiar Contraseña — {user.display_name}
          </h3>
          <button onClick={onClose} className="text-ama-text-muted hover:text-ama-text">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSelf && (
            <div>
              <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Contraseña Actual</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingrese contraseña actual"
                className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Nueva Contraseña</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Confirmar Contraseña</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita la nueva contraseña"
              className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ama-text-muted cursor-pointer">
            <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="rounded" />
            Mostrar contraseñas
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-ama-border rounded-xl text-sm text-ama-text-muted hover:text-ama-text transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-ama-amber hover:bg-ama-amber/90 text-ama-darker font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
              Cambiar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const { user: currentUser, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [message, setMessage] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleActive = async (user) => {
    try {
      await api.updateUser(user.id, { active: user.active ? 0 : 1 });
      loadUsers();
      setMessage({ type: 'success', text: `Usuario ${user.active ? 'desactivado' : 'activado'}` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteUser(id);
      setConfirmDelete(null);
      loadUsers();
      setMessage({ type: 'success', text: 'Usuario eliminado' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleUserSaved = () => {
    setShowUserModal(false);
    setEditUser(null);
    loadUsers();
    setMessage({ type: 'success', text: editUser ? 'Usuario actualizado' : 'Usuario creado' });
  };

  const handlePasswordSaved = async () => {
    setPasswordUser(null);
    // If changed own password, force re-login
    if (passwordUser?.id === currentUser?.id) {
      setMessage({ type: 'success', text: 'Contraseña actualizada. Debe iniciar sesión nuevamente.' });
      setTimeout(() => logout(), 1500);
    } else {
      setMessage({ type: 'success', text: 'Contraseña actualizada' });
    }
  };

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-ama-amber" />
          <h2 className="text-lg font-semibold text-ama-text">Gestión de Usuarios</h2>
          <span className="text-xs bg-ama-amber/10 text-ama-amber px-2 py-0.5 rounded-full">{users.length}</span>
        </div>
        <button
          onClick={() => { setEditUser(null); setShowUserModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-ama-amber hover:bg-ama-amber/90 text-ama-darker text-sm font-semibold rounded-xl transition-colors"
        >
          <UserPlus size={16} />
          Nuevo Usuario
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Users List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-ama-amber" />
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className={`bg-ama-card border rounded-xl p-4 ${u.active ? 'border-ama-border' : 'border-red-500/20 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    u.role === 'superadmin' ? 'bg-ama-amber/20 text-ama-amber' : 'bg-ama-border text-ama-text-muted'
                  }`}>
                    {u.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ama-text">{u.display_name}</span>
                      {u.role === 'superadmin' && (
                        <span className="flex items-center gap-1 text-[10px] bg-ama-amber/15 text-ama-amber px-1.5 py-0.5 rounded-full">
                          <ShieldCheck size={10} />
                          Super
                        </span>
                      )}
                      {!u.active && (
                        <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full">Inactivo</span>
                      )}
                      {currentUser?.id === u.id && (
                        <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full">Tú</span>
                      )}
                    </div>
                    <span className="text-xs text-ama-text-muted">@{u.username}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPasswordUser(u)}
                    className="p-2 text-ama-text-muted hover:text-ama-amber transition-colors"
                    title="Cambiar contraseña"
                  >
                    <Key size={16} />
                  </button>
                  <button
                    onClick={() => { setEditUser(u); setShowUserModal(true); }}
                    className="p-2 text-ama-text-muted hover:text-ama-amber transition-colors"
                    title="Editar usuario"
                  >
                    <Edit3 size={16} />
                  </button>
                  {currentUser?.id !== u.id && (
                    <>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`p-2 transition-colors ${u.active ? 'text-ama-text-muted hover:text-red-400' : 'text-red-400 hover:text-green-400'}`}
                        title={u.active ? 'Desactivar' : 'Activar'}
                      >
                        <Shield size={16} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        className="p-2 text-ama-text-muted hover:text-red-400 transition-colors"
                        title="Eliminar usuario"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showUserModal && (
        <UserModal
          user={editUser}
          onClose={() => { setShowUserModal(false); setEditUser(null); }}
          onSaved={handleUserSaved}
        />
      )}

      {passwordUser && (
        <PasswordModal
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onSaved={handlePasswordSaved}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-ama-card border border-ama-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-ama-text mb-3">Confirmar Eliminación</h3>
            <p className="text-sm text-ama-text-muted mb-5">
              ¿Está seguro de eliminar al usuario <strong className="text-ama-text">{confirmDelete.display_name}</strong> (@{confirmDelete.username})?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 border border-ama-border rounded-xl text-sm text-ama-text-muted hover:text-ama-text transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
