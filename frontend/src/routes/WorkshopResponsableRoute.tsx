import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppAuth } from './AppAuthContext';
import FullPageLoader from '../components/ui/FullPageLoader';

export default function WorkshopResponsableRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAppAuth();

  if (loading) return <FullPageLoader />;

  if (!session || session.accountType !== 'workshop') {
    return <Navigate to="/login" replace />;
  }

  if (session.user.role !== 'RESPONSABLE') {
    return <Navigate to="/workshop/dashboard" replace />;
  }

  return <>{children}</>;
}
