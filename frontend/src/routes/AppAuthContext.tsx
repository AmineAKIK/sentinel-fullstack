import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminInfo, WorkshopUser } from '../types';
import { getUnifiedMe, unifiedLogout, MeResponse } from '../api/unifiedAuth';

export type AuthSession =
  | { accountType: 'admin'; admin: AdminInfo }
  | { accountType: 'workshop'; user: WorkshopUser }
  | null;

interface AppAuthContextValue {
  session: AuthSession;
  loading: boolean;
  setSession: (session: AuthSession) => void;
  logout: () => Promise<void>;
}

const AppAuthContext = createContext<AppAuthContextValue | null>(null);
const PUBLIC_AUTHLESS_PATHS = ['/login', '/board', '/admin/login', '/workshop/login'];

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [session, setSession] = useState<AuthSession>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (PUBLIC_AUTHLESS_PATHS.includes(location.pathname)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getUnifiedMe()
      .then((response: MeResponse) => {
        if (response.accountType === 'admin') {
          setSession({ accountType: 'admin', admin: { id: response.id, username: response.username } });
        } else {
          setSession({
            accountType: 'workshop',
            user: {
              id: response.id,
              first_name: response.first_name,
              last_name: response.last_name,
              badge_number: response.badge_number,
              role: response.role,
            },
          });
        }
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [location.pathname]);

  const logout = useCallback(async () => {
    await unifiedLogout().catch(() => {});
    setSession(null);
  }, []);

  return (
    <AppAuthContext.Provider value={{ session, loading, setSession, logout }}>
      {children}
    </AppAuthContext.Provider>
  );
}

export function useAppAuth(): AppAuthContextValue {
  const ctx = useContext(AppAuthContext);
  if (!ctx) throw new Error('useAppAuth must be used within AppAuthProvider');
  return ctx;
}
