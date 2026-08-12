import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastContainer } from './components/ui/ToastContainer';
import { TopProgressBar } from './components/ui/TopProgressBar';
import { useAuth } from './hooks/useAuth';
import AcceptShareLink from './pages/AcceptShareLink';
import AdminDashboard from './pages/AdminDashboard';
import Dashboard from './pages/Dashboard';
import DocumentEditor from './pages/DocumentEditor';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import NotFoundPage from './pages/NotFoundPage';
import Signup from './pages/Signup';

/** "/" shows the marketing landing page to logged-out visitors, and sends already-authenticated
 *  users straight to their dashboard instead of re-showing the pitch. */
function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

export default function App() {
  const { checkAuth } = useAuth();

  useEffect(() => {
    void checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      <TopProgressBar />
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/share/:token" element={<AcceptShareLink />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/document/:id"
          element={
            <ProtectedRoute>
              <DocumentEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastContainer />
    </ErrorBoundary>
  );
}
