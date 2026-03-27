import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { identifyUser } from '../lib/analytics';

const AuthContext = createContext(null);
const SESSION_KEY = 'dip_finder_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) { setLoading(false); return; }
    try {
      const session = JSON.parse(stored);
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setUser({ ...d, token: session.token }); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } catch { setLoading(false); }
  }, []);

  const login = useCallback((token, email, userId) => {
    const session = { token, email, user_id: userId };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    identifyUser(email);
    setAuthSheetOpen(false);
    // Execute pending action (e.g. save a listing)
    if (pendingAction) {
      pendingAction(session);
      setPendingAction(null);
    }
  }, [pendingAction]);

  const logout = useCallback(async () => {
    if (user?.token) {
      try {
        await fetch('/api/auth/session', { method: 'DELETE', headers: { Authorization: `Bearer ${user.token}` } });
      } catch {}
    }
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, [user]);

  const openAuth = useCallback((action) => {
    if (action) setPendingAction(() => action);
    setAuthSheetOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthSheetOpen(false);
    setPendingAction(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, loading,
      login, logout, openAuth, closeAuth,
      authSheetOpen,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
