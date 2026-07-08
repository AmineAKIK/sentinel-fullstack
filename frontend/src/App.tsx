import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import WorkshopLoginPage from './pages/WorkshopLoginPage';
import WorkshopDashboardPage from './pages/WorkshopDashboardPage';
import WorkshopHistoryPage from './pages/WorkshopHistoryPage';
import WorkshopJournalPage from './pages/WorkshopJournalPage';
import WorkshopPilotagePage from './pages/WorkshopPilotagePage';
import WorkshopKnowledgePage from './pages/WorkshopKnowledgePage';
import BoardAccessPage from './pages/BoardAccessPage';
import WorkshopSupportPage from './pages/WorkshopSupportPage';
import PrivacyPage from './pages/PrivacyPage';
import AdminHomePage from './pages/AdminHomePage';
import UserListPage from './pages/UserListPage';
import UserDetailPage from './pages/UserDetailPage';
import LinesPage from './pages/LinesPage';
import AdminAuditPage from './pages/AdminAuditPage';
import AdminSupportPage from './pages/AdminSupportPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import { AppAuthProvider } from './routes/AppAuthContext';
import { FieldLimitsProvider } from './routes/FieldLimitsContext';
import AdminRoute from './routes/AdminRoute';
import WorkshopRoute from './routes/WorkshopRoute';
import WorkshopResponsableRoute from './routes/WorkshopResponsableRoute';
import GuestRoute from './routes/GuestRoute';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <FieldLimitsProvider>
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
          <Route path="/confidentialite" element={<PrivacyPage />} />
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
            path="/workshop/journal"
            element={
              <WorkshopResponsableRoute>
                <WorkshopJournalPage />
              </WorkshopResponsableRoute>
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
          <Route
            path="/admin/parametres"
            element={
              <AdminRoute>
                <AdminSettingsPage />
              </AdminRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppAuthProvider>
      </FieldLimitsProvider>
    </ErrorBoundary>
  );
}
