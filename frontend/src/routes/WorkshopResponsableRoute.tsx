import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppAuth } from './AppAuthContext';

export default function WorkshopResponsableRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAppAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }

  if (!session || session.accountType !== 'workshop') {
    return <Navigate to="/login" replace />;
  }

  if (session.user.role !== 'RESPONSABLE') {
    return <Navigate to="/workshop/dashboard" replace />;
  }

  return <>{children}</>;
}
