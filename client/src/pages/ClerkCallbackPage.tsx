import { useEffect, useState } from 'react';
import axios from 'axios';
import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/react';
import { Navigate, useNavigate } from 'react-router-dom';

const callbackErrorMessage = 'Could not complete Google sign-in. Please try again.';

function getClerkPublishableKey() {
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}

/** Complete the Clerk redirect and exchange the Clerk token for AMPM tokens. */
function ClerkCallbackContent() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let isCancelled = false;

    async function exchangeClerkToken() {
      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          throw new Error(callbackErrorMessage);
        }

        const response = await axios.post(
          '/api/auth/clerk',
          {},
          {
            headers: {
              Authorization: `Bearer ${clerkToken}`,
            },
          }
        );

        if (isCancelled) {
          return;
        }

        const { accessToken, refreshToken } = response.data;
        localStorage.setItem('ampm_access_token', accessToken);
        localStorage.setItem('ampm_refresh_token', refreshToken);
        navigate('/');
      } catch (err: any) {
        if (isCancelled) {
          return;
        }

        setError(err.response?.data?.error || err.message || callbackErrorMessage);
      }
    }

    void exchangeClerkToken();

    return () => {
      isCancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, navigate]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <AuthenticateWithRedirectCallback />
        <h1 className="brand-title">AMPM</h1>
        <p className="auth-subtitle">Completing Google sign-in...</p>
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}

/** Guard the Clerk callback route when Clerk is not configured in this client. */
export default function ClerkCallbackPage() {
  if (!getClerkPublishableKey()) {
    return <Navigate to="/login" replace />;
  }

  return <ClerkCallbackContent />;
}
