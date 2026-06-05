import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import WorkshopLoginPage from './pages/WorkshopLoginPage';
import WorkshopDashboardPage from './pages/WorkshopDashboardPage';
import WorkshopHistoryPage from './pages/WorkshopHistoryPage';
import WorkshopPilotagePage from './pages/WorkshopPilotagePage';
import WorkshopKnowledgePage from './pages/WorkshopKnowledgePage';
import WorkshopBoardPage from './pages/WorkshopBoardPage';
import AdminHomePage from './pages/AdminHomePage';
import UserListPage from './pages/UserListPage';
import UserDetailPage from './pages/UserDetailPage';
import LinesPage from './pages/LinesPage';
import AdminAuditPage from './pages/AdminAuditPage';
import AdminSupportPage from './pages/AdminSupportPage';
import WorkshopSupportPage from './pages/WorkshopSupportPage';
import { AuthProvider } from './routes/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import PublicRoute from './routes/PublicRoute';
import { WorkshopAuthProvider } from './routes/WorkshopAuthContext';
import WorkshopProtectedRoute from './routes/WorkshopProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <WorkshopAuthProvider>
        <a className="skip-link" href="#main-content">Passer au contenu principal</a>
        <Routes>
          <Route path="/" element={<Navigate to="/admin/login" replace />} />
          <Route path="/workshop" element={<WorkshopLoginPage />} />
          <Route
            path="/workshop/dashboard"
            element={
              <WorkshopProtectedRoute>
                <WorkshopDashboardPage />
              </WorkshopProtectedRoute>
            }
          />
          <Route
            path="/workshop/pilotage"
            element={
              <WorkshopProtectedRoute>
                <WorkshopPilotagePage />
              </WorkshopProtectedRoute>
            }
          />
          <Route
            path="/workshop/history"
            element={
              <WorkshopProtectedRoute>
                <WorkshopHistoryPage />
              </WorkshopProtectedRoute>
            }
          />
          <Route
            path="/workshop/knowledge"
            element={
              <WorkshopProtectedRoute>
                <WorkshopKnowledgePage />
              </WorkshopProtectedRoute>
            }
          />
          <Route
            path="/workshop/support"
            element={
              <WorkshopProtectedRoute>
                <WorkshopSupportPage />
              </WorkshopProtectedRoute>
            }
          />
          <Route
            path="/workshop/board"
            element={
              <WorkshopBoardPage />
            }
          />
        <Route path="/admin" element={<Navigate to="/admin/accueil" replace />} />
        <Route path="/admin/acceuil" element={<Navigate to="/admin/accueil" replace />} />
        <Route
          path="/admin/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/admin/accueil"
          element={
            <ProtectedRoute>
              <AdminHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <UserListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <ProtectedRoute>
              <UserDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/lines"
          element={
            <ProtectedRoute>
              <LinesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute>
              <AdminAuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/support"
          element={
            <ProtectedRoute>
              <AdminSupportPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </WorkshopAuthProvider>
    </AuthProvider>
  );
}
