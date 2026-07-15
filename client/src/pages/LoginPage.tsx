import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSignIn } from '@clerk/react';
import api from '../api';

function getClerkPublishableKey() {
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}

type LoginCardProps = {
  error: string | null;
  email: string;
  password: string;
  isLoading: boolean;
  isGoogleLoading: boolean;
  isGoogleEnabled: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
};

/** Show the shared login card with local and Google sign-in actions. */
function LoginCard({
  error,
  email,
  password,
  isLoading,
  isGoogleLoading,
  isGoogleEnabled,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleSignIn,
}: LoginCardProps) {
  const isGoogleDisabled = isLoading || isGoogleLoading || !isGoogleEnabled;

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="brand-title">AMPM</h1>
        <p className="auth-subtitle">Sign in to your media pipeline account</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={isGoogleDisabled}
          onClick={() => void onGoogleSignIn()}
        >
          {isGoogleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>

        {!isGoogleEnabled && (
          <p>Google sign-in is unavailable until Clerk is configured.</p>
        )}

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Create one now</Link>
        </p>
      </div>
    </div>
  );
}

/** Provide the existing email/password login flow when Clerk is disabled. */
function LocalLoginPage() {
  return <LoginPageContent isGoogleEnabled={false} onGoogleSignIn={async () => undefined} />;
}

/** Provide the Google redirect action when Clerk is configured. */
function ClerkLoginPage() {
  const { fetchStatus, signIn } = useSignIn();

  async function handleGoogleSignIn() {
    if (fetchStatus === 'fetching') {
      return;
    }

    await signIn.sso({
      strategy: 'oauth_google',
      redirectUrl: '/sso-callback',
      redirectCallbackUrl: '/sso-callback',
    });
  }

  return <LoginPageContent isGoogleEnabled={fetchStatus !== 'fetching'} onGoogleSignIn={handleGoogleSignIn} />;
}

/** Handle the local password login flow and shared error state. */
function LoginPageContent({
  isGoogleEnabled,
  onGoogleSignIn,
}: {
  isGoogleEnabled: boolean;
  onGoogleSignIn: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken } = response.data;
      localStorage.setItem('ampm_access_token', accessToken);
      localStorage.setItem('ampm_refresh_token', refreshToken);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          'Could not log in. Check your credentials and database connection.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);
    setError(null);

    try {
      await onGoogleSignIn();
    } catch (err: any) {
      setError(err.message || 'Could not start Google sign-in. Please try again.');
      setIsGoogleLoading(false);
    }
  }

  return (
    <LoginCard
      error={error}
      email={email}
      password={password}
      isLoading={isLoading}
      isGoogleLoading={isGoogleLoading}
      isGoogleEnabled={isGoogleEnabled}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
      onGoogleSignIn={handleGoogleSignIn}
    />
  );
}

/** Render the right login experience for the current Clerk configuration. */
export default function LoginPage() {
  if (!getClerkPublishableKey()) {
    return <LocalLoginPage />;
  }

  return <ClerkLoginPage />;
}
