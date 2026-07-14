import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="brand-title">AMPM</h1>
        <p className="auth-subtitle">Sign in to your media pipeline account</p>
        
        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Create one now</Link>
        </p>
      </div>
    </div>
  );
}
