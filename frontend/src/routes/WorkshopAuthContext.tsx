import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getWorkshopMe, workshopLogout } from '../api/workshopAuth';
import { WorkshopUser } from '../types';

interface WorkshopAuthContextValue {
  user: WorkshopUser | null;
  loading: boolean;
  setUser: (user: WorkshopUser | null) => void;
  logout: () => Promise<void>;
}

const WorkshopAuthContext = createContext<WorkshopAuthContextValue | null>(null);

export function WorkshopAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WorkshopUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkshopMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await workshopLogout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <WorkshopAuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </WorkshopAuthContext.Provider>
  );
}

export function useWorkshopAuth(): WorkshopAuthContextValue {
  const ctx = useContext(WorkshopAuthContext);
  if (!ctx) throw new Error('useWorkshopAuth must be used within WorkshopAuthProvider');
  return ctx;
}
