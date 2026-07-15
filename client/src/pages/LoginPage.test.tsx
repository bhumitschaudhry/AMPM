import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
  },
}));

// CLERK DISABLED — Clerk mock preserved in comments:
// const startGoogleSso = vi.fn();
// const useSignInMock = vi.fn();
// vi.mock('@clerk/react', () => ({
//   useSignIn: () => useSignInMock(),
// }));

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // CLERK DISABLED — restore when Clerk is re-enabled:
    // useSignInMock.mockReturnValue({
    //   fetchStatus: 'idle',
    //   signIn: { sso: startGoogleSso },
    // });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the sign-in form', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows a link to signup', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /create/i })).toBeInTheDocument();
  });

  // CLERK DISABLED — Google SSO tests preserved in comments:
  // it('renders Google sign-in alongside the password form', () => {
  //   vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_123');
  //   render(<MemoryRouter><LoginPage /></MemoryRouter>);
  //   expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  //   expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  //   expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  // });
  //
  // it('starts the Clerk Google redirect when the button is clicked', async () => {
  //   vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_123');
  //   render(<MemoryRouter><LoginPage /></MemoryRouter>);
  //   fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
  //   await waitFor(() =>
  //     expect(startGoogleSso).toHaveBeenCalledWith({
  //       strategy: 'oauth_google',
  //       redirectUrl: '/sso-callback',
  //       redirectCallbackUrl: '/sso-callback',
  //     })
  //   );
  // });
  //
  // it('shows a disabled Google button and helper text when Clerk is not configured', () => {
  //   render(<MemoryRouter><LoginPage /></MemoryRouter>);
  //   expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled();
  //   expect(screen.getByText(/google sign-in is unavailable until clerk is configured/i)).toBeInTheDocument();
  // });
  //
  // it('shows Clerk redirect errors in the existing banner', async () => {
  //   vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_123');
  //   startGoogleSso.mockRejectedValueOnce(new Error('Google redirect failed.'));
  //   render(<MemoryRouter><LoginPage /></MemoryRouter>);
  //   fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
  //   expect(await screen.findByText('Google redirect failed.')).toBeInTheDocument();
  // });
});

// Suppress unused import warnings from vi — these are kept for quick re-enablement.
void fireEvent;
void waitFor;
