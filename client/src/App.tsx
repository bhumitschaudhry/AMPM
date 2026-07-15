import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Dashboard from './pages/Dashboard';
import JobDetailPage from './pages/JobDetailPage';
// CLERK DISABLED — uncomment to re-enable the Clerk OAuth callback route
// import ClerkCallbackPage from './pages/ClerkCallbackPage';

/** Wrapper to protect routes requiring authentication. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('ampm_access_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* CLERK DISABLED — uncomment to re-enable the SSO callback route */}
      {/* <Route path="/sso-callback" element={<ClerkCallbackPage />} /> */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <ProtectedRoute>
            <JobDetailPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
