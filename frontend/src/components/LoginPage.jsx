import { useState, useEffect, useCallback } from 'react';
import { Lock, User, Eye, EyeOff, RefreshCw, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    try {
      const data = await api.authCaptcha();
      setCaptcha(data);
      setCaptchaAnswer('');
    } catch {
      setError('Error al cargar captcha');
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Ingrese usuario y contraseña');
      return;
    }
    if (!captchaAnswer.trim()) {
      setError('Resuelva la operación matemática');
      return;
    }

    setLoading(true);
    try {
      await login(username.trim(), password, captcha?.id, captchaAnswer.trim());
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
      if (err.data?.captcha_invalid || err.status === 400 || err.status === 401) {
        loadCaptcha();
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-ama-darker flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img
              src="/images/logo-ama.jpg"
              alt="AMA Café"
              className="w-14 h-14 rounded-full object-cover border-2 border-ama-amber/30"
            />
          </div>
          <h1 className="text-2xl font-bold text-ama-text">
            <span className="text-ama-amber">AMA</span> Café
          </h1>
          <p className="text-sm text-ama-text-muted mt-1">Panel de Administración</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-ama-card border border-ama-border rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={20} className="text-ama-amber" />
            <h2 className="text-lg font-semibold text-ama-text">Iniciar Sesión</h2>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Username */}
          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Usuario</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ama-text-muted" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ingrese su usuario"
                autoComplete="username"
                autoFocus
                className="w-full bg-ama-darker border border-ama-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Contraseña</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ama-text-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingrese su contraseña"
                autoComplete="current-password"
                className="w-full bg-ama-darker border border-ama-border rounded-xl pl-10 pr-10 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ama-text-muted hover:text-ama-text"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* CAPTCHA */}
          <div>
            <label className="text-xs text-ama-text-muted font-medium mb-1.5 block">Verificación</label>
            <div className="flex items-center gap-3 mb-2">
              {captcha?.image ? (
                <img
                  src={captcha.image}
                  alt="Captcha"
                  className="rounded-lg border border-ama-border h-[50px]"
                />
              ) : (
                <div className="w-[150px] h-[50px] bg-ama-darker rounded-lg border border-ama-border flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-ama-text-muted" />
                </div>
              )}
              <button
                type="button"
                onClick={loadCaptcha}
                className="p-2 text-ama-text-muted hover:text-ama-amber transition-colors"
                title="Nuevo captcha"
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <input
              type="text"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              placeholder="Resultado de la operación"
              inputMode="numeric"
              className="w-full bg-ama-darker border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ama-amber hover:bg-ama-amber/90 text-ama-darker font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-ama-text-muted/50 mt-4">
          Acceso restringido a personal autorizado
        </p>
      </div>
    </div>
  );
}
