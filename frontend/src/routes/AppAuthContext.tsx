import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminInfo, WorkshopUser } from '../types';
import { getUnifiedMe, unifiedLogout, MeResponse } from '../api/unifiedAuth';
import { setOn401Handler, ApiResponseError } from '../api/client';
import { useMutationRunner } from '../components/ui/MutationFeedback';
import { apiErrorMessage } from '../api/errorMessages';

export type AuthSession =
  | { accountType: 'admin'; admin: AdminInfo }
  | { accountType: 'workshop'; user: WorkshopUser }
  | null;

interface AppAuthContextValue {
  session: AuthSession;
  loading: boolean;
  setSession: (session: AuthSession) => void;
  logout: () => Promise<boolean>;
  logoutPending: boolean;
}

const AppAuthContext = createContext<AppAuthContextValue | null>(null);
const PUBLIC_AUTHLESS_PATHS = new Set([
  '/login',
  '/board',
  '/admin/login',
  '/workshop/login',
  '/confidentialite',
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_AUTHLESS_PATHS.has(pathname);
}

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);
  const mutation = useMutationRunner();

  // Callback stable appelé sur 401 — protégé par ref pour ne déclencher qu'une fois.
  const markExpired = useCallback(
    (error?: ApiResponseError) => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      void unifiedLogout().catch(() => undefined);
      setSession(null);
      const reason =
        error?.code === 'SESSION_REVOKED'
          ? 'Session révoquée après cinq tentatives de mot de passe incorrectes.'
          : 'Session expirée ou révoquée. Reconnectez-vous.';
      sessionStorage.setItem('sentinel.login.reason', reason);
      void navigate('/login', { replace: true });
    },
    [navigate]
  );

  // Reset du flag à chaque changement de route (nouvelle navigation = nouvelle session potentielle).
  useEffect(() => {
    redirectingRef.current = false;
  }, [location.pathname]);

  // Enregistre le handler 401 pour les appels API mid-session.
  useEffect(() => {
    if (isPublic(location.pathname)) {
      setOn401Handler(null);
      return () => setOn401Handler(null);
    }
    setOn401Handler(markExpired);
    return () => setOn401Handler(null);
  }, [location.pathname, markExpired]);

  // Vérifie la session à chaque changement de route.
  useEffect(() => {
    if (isPublic(location.pathname)) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    void getUnifiedMe(controller.signal)
      .then((response: MeResponse) => {
        if (response.accountType === 'admin') {
          setSession({
            accountType: 'admin',
            admin: { id: response.id, username: response.username },
          });
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
        if (controller.signal.aborted) return;
        if (err instanceof ApiResponseError && err.status === 401) {
          markExpired(err);
        } else {
          setSession(null);
          sessionStorage.setItem(
            'sentinel.login.reason',
            'Impossible de vérifier la session. Vérifiez la connexion puis reconnectez-vous.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [location.pathname, markExpired]);

  const logout = useCallback(async () => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const result = await mutation.execute(unifiedLogout, {
      key: 'auth:logout',
      toErrorMessage: (err) => apiErrorMessage(err, 'Impossible de se déconnecter. Réessayez.'),
      onSuccess: () => setSession(null),
      onError: () => {
        requestAnimationFrame(() => {
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        });
      },
    });
    return result.status === 'success';
  }, [mutation]);

  const contextValue = useMemo(
    () => ({
      session,
      loading,
      setSession,
      logout,
      logoutPending: mutation.isPending('auth:logout'),
    }),
    [session, loading, logout, mutation]
  );

  return <AppAuthContext.Provider value={contextValue}>{children}</AppAuthContext.Provider>;
}

export function useAppAuth(): AppAuthContextValue {
  const ctx = useContext(AppAuthContext);
  if (!ctx) throw new Error('useAppAuth must be used within AppAuthProvider');
  return ctx;
}
