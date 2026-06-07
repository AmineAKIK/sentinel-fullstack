import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import WorkshopLoginPage from './pages/WorkshopLoginPage';
import WorkshopDashboardPage from './pages/WorkshopDashboardPage';
import WorkshopHistoryPage from './pages/WorkshopHistoryPage';
import WorkshopPilotagePage from './pages/WorkshopPilotagePage';
import WorkshopKnowledgePage from './pages/WorkshopKnowledgePage';
import BoardAccessPage from './pages/BoardAccessPage';
import WorkshopSupportPage from './pages/WorkshopSupportPage';
import AdminHomePage from './pages/AdminHomePage';
import UserListPage from './pages/UserListPage';
import UserDetailPage from './pages/UserDetailPage';
import LinesPage from './pages/LinesPage';
import AdminAuditPage from './pages/AdminAuditPage';
import AdminSupportPage from './pages/AdminSupportPage';
import { AppAuthProvider } from './routes/AppAuthContext';
import AdminRoute from './routes/AdminRoute';
import WorkshopRoute from './routes/WorkshopRoute';
import GuestRoute from './routes/GuestRoute';

export default function App() {
  return (
    <AppAuthProvider>
      <a className="skip-link" href="#main-content">Passer au contenu principal</a>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route path="/board" element={<BoardAccessPage />} />
        <Route
          path="/admin/login"
          element={
            <GuestRoute>
              <AdminLoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/workshop/login"
          element={
            <GuestRoute>
              <WorkshopLoginPage />
            </GuestRoute>
          }
        />

        {/* Workshop routes */}
        <Route
          path="/workshop/dashboard"
          element={
            <WorkshopRoute>
              <WorkshopDashboardPage />
            </WorkshopRoute>
          }
        />
        <Route
          path="/workshop/pilotage"
          element={
            <WorkshopRoute>
              <WorkshopPilotagePage />
            </WorkshopRoute>
          }
        />
        <Route
          path="/workshop/history"
          element={
            <WorkshopRoute>
              <WorkshopHistoryPage />
            </WorkshopRoute>
          }
        />
        <Route
          path="/workshop/knowledge"
          element={
            <WorkshopRoute>
              <WorkshopKnowledgePage />
            </WorkshopRoute>
          }
        />
        <Route
          path="/workshop/support"
          element={
            <WorkshopRoute>
              <WorkshopSupportPage />
            </WorkshopRoute>
          }
        />
        {/* Admin routes */}
        <Route path="/admin" element={<Navigate to="/admin/accueil" replace />} />
        <Route
          path="/admin/accueil"
          element={
            <AdminRoute>
              <AdminHomePage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <UserListPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <AdminRoute>
              <UserDetailPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/lines"
          element={
            <AdminRoute>
              <LinesPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <AdminRoute>
              <AdminAuditPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/support"
          element={
            <AdminRoute>
              <AdminSupportPage />
            </AdminRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AppAuthProvider>
  );
}
