import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as authApi from '../api/authApi';
import { getToken, setToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken())); // true only while restoring a saved session

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Restore the session from a saved token
  useEffect(() => {
    if (!getToken()) return;
    authApi.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Expired or revoked token on any request
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      toast.error('Your session expired. Sign in again to continue.', { id: 'session-expired' });
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { user: u, token } = await authApi.login(email, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { user: u, token } = await authApi.register(name, email, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAdmin: user?.role === 'admin', login, register, logout }),
    [user, loading, login, register, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
