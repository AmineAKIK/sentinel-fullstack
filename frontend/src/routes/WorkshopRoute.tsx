import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppAuth } from './AppAuthContext';
import FullPageLoader from '../components/ui/FullPageLoader';

export default function WorkshopRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAppAuth();

  if (loading) return <FullPageLoader />;

  if (!session || session.accountType !== 'workshop') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
