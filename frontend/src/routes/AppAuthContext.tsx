import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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

function isPublic(pathname: string) {
  return PUBLIC_AUTHLESS_PATHS.some((p) => pathname.startsWith(p));
}

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);

  // Callback stable appelé sur 401 — navigue directement, protégé par ref pour ne déclencher qu'une fois.
  const markExpired = useCallback(() => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    unifiedLogout().catch(() => {});
    setSession(null);
    navigate('/login', {
      replace: true,
      state: { reason: 'Session expirée ou révoquée. Reconnectez-vous.' },
    });
  }, [navigate]);

  // Reset du flag à chaque changement de route (nouvelle navigation = nouvelle session potentielle).
  useEffect(() => {
    redirectingRef.current = false;
  }, [location.pathname]);

  // Enregistre le handler 401 pour les appels API mid-session.
  useEffect(() => {
    if (isPublic(location.pathname)) {
      setOn401Handler(() => {});
      return;
    }
    setOn401Handler(markExpired);
    return () => setOn401Handler(() => {});
  }, [location.pathname, markExpired]);

  // Vérifie la session à chaque changement de route.
  useEffect(() => {
    if (isPublic(location.pathname)) {
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
          markExpired();
        } else {
          setSession(null);
        }
      })
      .finally(() => setLoading(false));
  }, [location.pathname, markExpired]);

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
