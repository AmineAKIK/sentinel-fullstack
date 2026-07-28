import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import FullPageLoader from './components/ui/FullPageLoader';
import { MutationFeedbackProvider } from './components/ui/MutationFeedback';
import { AppAuthProvider } from './routes/AppAuthContext';
import AdminRoute from './routes/AdminRoute';
import { FieldLimitsProvider } from './routes/FieldLimitsContext';
import GuestRoute from './routes/GuestRoute';
import WorkshopResponsableRoute from './routes/WorkshopResponsableRoute';
import WorkshopRoute from './routes/WorkshopRoute';

const AdminAuditPage = lazy(() => import('./pages/AdminAuditPage'));
const AdminHomePage = lazy(() => import('./pages/AdminHomePage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const AdminSupportPage = lazy(() => import('./pages/AdminSupportPage'));
const BoardAccessPage = lazy(() => import('./pages/BoardAccessPage'));
const LinesPage = lazy(() => import('./pages/LinesPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage'));
const UserListPage = lazy(() => import('./pages/UserListPage'));
const WorkshopDashboardPage = lazy(() => import('./pages/WorkshopDashboardPage'));
const WorkshopHistoryPage = lazy(() => import('./pages/WorkshopHistoryPage'));
const WorkshopJournalPage = lazy(() => import('./pages/WorkshopJournalPage'));
const WorkshopKnowledgePage = lazy(() => import('./pages/WorkshopKnowledgePage'));
const WorkshopLoginPage = lazy(() => import('./pages/WorkshopLoginPage'));
const WorkshopPilotagePage = lazy(() => import('./pages/WorkshopPilotagePage'));
const WorkshopSupportPage = lazy(() => import('./pages/WorkshopSupportPage'));

export default function App() {
  return (
    <ErrorBoundary>
      <FieldLimitsProvider>
        <MutationFeedbackProvider>
          <AppAuthProvider>
            <a className="skip-link" href="#main-content">
              Passer au contenu principal
            </a>
            <Suspense fallback={<FullPageLoader />}>
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
            </Suspense>
          </AppAuthProvider>
        </MutationFeedbackProvider>
      </FieldLimitsProvider>
    </ErrorBoundary>
  );
}
