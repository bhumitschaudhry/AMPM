import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { describe, it, expect } from 'vitest';
import App from './App';

const renderWithProviders = (ui: React.ReactNode, initialEntries: string[] = ['/']) =>
  render(
    <GoogleOAuthProvider clientId="test-client-id">
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </GoogleOAuthProvider>
  );

describe('App', () => {
  it('renders login page on /login route', () => {
    renderWithProviders(<App />, ['/login']);
    expect(screen.getByRole('heading', { name: /ampm/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders signup page on /signup route', () => {
    renderWithProviders(<App />, ['/signup']);
    expect(screen.getByText(/create your/i)).toBeInTheDocument();
  });

  it('redirects to login when token is missing on / route', () => {
    localStorage.clear();
    renderWithProviders(<App />, ['/']);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
