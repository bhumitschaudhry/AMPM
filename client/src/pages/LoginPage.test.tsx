import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

/** Wrap LoginPage with the providers it needs to render. */
function renderLoginPage() {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </GoogleOAuthProvider>
  );
}

vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the sign-in form', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows a link to signup', () => {
    renderLoginPage();
    expect(screen.getByRole('link', { name: /create/i })).toBeInTheDocument();
  });

  it('renders the Google OAuth login container', () => {
    renderLoginPage();
    // The GoogleLogin component renders inside #google-login-btn.
    // We check the container div is present; the actual Google button is
    // injected by the GSI script and not available in jsdom.
    expect(document.getElementById('google-login-btn')).toBeInTheDocument();
  });
});
