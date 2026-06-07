import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppAuth } from './AppAuthContext';

export default function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAppAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span className="spinner" />
      </div>
    );
  }

  if (session?.accountType === 'admin') return <Navigate to="/admin/accueil" replace />;
  if (session?.accountType === 'workshop') return <Navigate to="/workshop/dashboard" replace />;

  return <>{children}</>;
}
