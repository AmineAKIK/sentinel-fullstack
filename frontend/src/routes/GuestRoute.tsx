import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppAuth } from './AppAuthContext';
import FullPageLoader from '../components/ui/FullPageLoader';

export default function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAppAuth();

  if (loading) return <FullPageLoader />;

  if (session?.accountType === 'admin') return <Navigate to="/admin/accueil" replace />;
  if (session?.accountType === 'workshop') return <Navigate to="/workshop/dashboard" replace />;

  return <>{children}</>;
}
