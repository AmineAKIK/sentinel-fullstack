import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminInfo, WorkshopUser } from '../types';
import { getUnifiedMe, unifiedLogout, MeResponse } from '../api/unifiedAuth';
import { setOn401Handler, ApiResponseError } from '../api/client';

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
  const navigate = useNavigate();
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
      .catch((err: unknown) => {
        if (err instanceof ApiResponseError && err.status === 401) {
          unifiedLogout().catch(() => {});
          navigate('/login', {
            replace: true,
            state: { reason: 'Session expirée ou révoquée. Reconnectez-vous.' },
          });
        }
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, [location.pathname]);

  const logout = useCallback(async () => {
    await unifiedLogout().catch(() => {});
    setSession(null);
  }, []);

  // Intercepteur global 401 : session révoquée depuis un autre appareil.
  // On ne branche le handler que sur les routes authentifiées pour éviter
  // les boucles de redirection sur les pages publiques.
  useEffect(() => {
    if (PUBLIC_AUTHLESS_PATHS.some((p) => location.pathname.startsWith(p))) return;

    setOn401Handler(() => {
      unifiedLogout().catch(() => {});
      setSession(null);
      navigate('/login', {
        replace: true,
        state: { reason: 'Session expirée ou révoquée. Reconnectez-vous.' },
      });
    });

    return () => setOn401Handler(() => {});
  }, [location.pathname, navigate]);

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
