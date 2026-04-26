import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api';

const TOKEN_KEY = 'admin_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // loading=true sólo si hay token que validar; sin token no hay nada async pendiente.
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return undefined;

    let cancelled = false;
    api.authCheck(token)
      .then((data) => {
        if (cancelled) return;
        if (data && data.user) {
          setUser(data.user);
        } else {
          clearSession();
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clearSession]);

  useEffect(() => {
    const handler = () => clearSession();
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, [clearSession]);

  const login = useCallback(async (username, password, captchaId, captchaAnswer) => {
    const data = await api.authLogin(username, password, captchaId, captchaAnswer);
    if (!data?.token || !data?.user) {
      const err = new Error('Respuesta de autenticación inválida');
      err.data = data;
      throw err;
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        await api.authLogout(token);
      } catch {
        // logout best-effort: aunque falle el endpoint, limpiamos sesión local
      }
    }
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
