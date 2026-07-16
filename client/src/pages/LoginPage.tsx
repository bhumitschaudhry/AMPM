import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import api from '../api';

type EmailFormProps = {
  error: string | null;
  email: string;
  password: string;
  isLoading: boolean;
  isGoogleLoading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onGoogleSuccess: (credential: string) => Promise<void>;
  onGoogleError: () => void;
};

/** Show the login card with email/password and Google OAuth sign-in. */
function LoginCard({
  error,
  email,
  password,
  isLoading,
  isGoogleLoading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleSuccess,
  onGoogleError,
}: EmailFormProps) {
  const isAnyLoading = isLoading || isGoogleLoading;

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
              disabled={isAnyLoading}
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
              disabled={isAnyLoading}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isAnyLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div id="google-login-btn" style={{ marginTop: '1rem', opacity: isGoogleLoading ? 0.6 : 1 }}>
          {/* GoogleLogin renders Google's own branded button and returns credential (id_token). */}
          <GoogleLogin
            onSuccess={(response) => {
              if (response.credential) {
                void onGoogleSuccess(response.credential);
              }
            }}
            onError={onGoogleError}
            useOneTap={false}
            text="continue_with"
            width="100%"
          />
        </div>

        {isGoogleLoading && (
          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted, #888)' }}>
            Signing in with Google…
          </p>
        )}

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Create one now</Link>
        </p>
      </div>
    </div>
  );
}

/** Stores the token pair in localStorage using the keys that api.ts expects. */
function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('ampm_access_token', accessToken);
  localStorage.setItem('ampm_refresh_token', refreshToken);
}

/** Handle the local email/password and Google OAuth login flows. */
export default function LoginPage() {
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
      storeTokens(accessToken, refreshToken);
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

  /**
   * Called by GoogleLogin after the user completes Google consent.
   * `credential` is the id_token — we send it to our server for verification.
   * The server verifies with Google's public keys (never trusting client-supplied email).
   */
  async function handleGoogleSuccess(credential: string) {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const response = await api.post('/auth/google', { idToken: credential });
      const { accessToken, refreshToken } = response.data;
      storeTokens(accessToken, refreshToken);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          'Google sign-in failed. Please try again or use email and password.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  }

  function handleGoogleError() {
    setError('Google sign-in was cancelled or failed. Please try again.');
  }

  return (
    <LoginCard
      error={error}
      email={email}
      password={password}
      isLoading={isLoading}
      isGoogleLoading={isGoogleLoading}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
      onGoogleSuccess={handleGoogleSuccess}
      onGoogleError={handleGoogleError}
    />
  );
}
