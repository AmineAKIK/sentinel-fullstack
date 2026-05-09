import React from 'react';
import { Navigate } from 'react-router-dom';
import { useWorkshopAuth } from './WorkshopAuthContext';

export default function WorkshopProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useWorkshopAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span className="spinner" />
      </div>
    );
  }

  if (!user) return <Navigate to="/workshop" replace />;

  return <>{children}</>;
}
