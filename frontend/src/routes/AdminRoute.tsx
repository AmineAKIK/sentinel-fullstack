import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppAuth } from './AppAuthContext';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAppAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }

  if (!session || session.accountType !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
