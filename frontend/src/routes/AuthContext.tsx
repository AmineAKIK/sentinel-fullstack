import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AdminInfo } from '../types';
import { getMe, logout as apiLogout } from '../api/auth';

interface AuthContextValue {
  admin: AdminInfo | null;
  loading: boolean;
  setAdmin: (admin: AdminInfo | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setAdmin(null);
  }, []);

  return (
    <AuthContext.Provider value={{ admin, loading, setAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
