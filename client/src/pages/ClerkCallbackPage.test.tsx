// CLERK DISABLED — this test file tests the Clerk OAuth callback page, which is
// currently disabled. All tests are commented out. Restore when Clerk is re-enabled.

// import { render, screen, waitFor } from '@testing-library/react';
// import { MemoryRouter } from 'react-router-dom';
// import { beforeEach, describe, expect, it, vi } from 'vitest';
// import ClerkCallbackPage from './ClerkCallbackPage';
// const navigateMock = vi.hoisted(() => vi.fn());
// const useAuthMock = vi.hoisted(() => vi.fn());
// const postMock = vi.hoisted(() => vi.fn());
//
// vi.mock('axios', () => ({
//   default: {
//     post: postMock,
//   },
// }));
//
// vi.mock('react-router-dom', async () => {
//   const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
//   return {
//     ...actual,
//     useNavigate: () => navigateMock,
//   };
// });
//
// vi.mock('@clerk/react', () => ({
//   AuthenticateWithRedirectCallback: () => <div data-testid="clerk-redirect-callback" />,
//   useAuth: () => useAuthMock(),
// }));
//
// describe('ClerkCallbackPage', () => {
//   beforeEach(() => {
//     localStorage.clear();
//     vi.clearAllMocks();
//     vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_123');
//   });
//
//   it('exchanges the Clerk token and stores AMPM tokens after callback completion', async () => {
//     useAuthMock.mockReturnValue({
//       isLoaded: true,
//       isSignedIn: true,
//       getToken: vi.fn().mockResolvedValue('clerk-session'),
//     });
//     postMock.mockResolvedValueOnce({
//       data: {
//         accessToken: 'ampm-access',
//         refreshToken: 'ampm-refresh',
//       },
//     });
//
//     render(
//       <MemoryRouter>
//         <ClerkCallbackPage />
//       </MemoryRouter>
//     );
//
//     await waitFor(() =>
//       expect(postMock).toHaveBeenCalledWith(
//         '/api/auth/clerk',
//         {},
//         {
//           headers: {
//             Authorization: 'Bearer clerk-session',
//           },
//         }
//       )
//     );
//
//     expect(localStorage.getItem('ampm_access_token')).toBe('ampm-access');
//     expect(localStorage.getItem('ampm_refresh_token')).toBe('ampm-refresh');
//     expect(navigateMock).toHaveBeenCalledWith('/');
//   });
//
//   it('shows the exchange error when callback authentication fails', async () => {
//     useAuthMock.mockReturnValue({
//       isLoaded: true,
//       isSignedIn: true,
//       getToken: vi.fn().mockResolvedValue(null),
//     });
//
//     render(
//       <MemoryRouter>
//         <ClerkCallbackPage />
//       </MemoryRouter>
//     );
//
//     expect(
//       await screen.findByText('Could not complete Google sign-in. Please try again.')
//     ).toBeInTheDocument();
//     expect(navigateMock).not.toHaveBeenCalled();
//   });
// });

// Vitest requires at least one test in a file; this placeholder keeps the suite valid.
import { describe, it } from 'vitest';
describe('ClerkCallbackPage (CLERK DISABLED)', () => {
  it('is a placeholder — restore tests when Clerk is re-enabled', () => {
    // No-op: Clerk is currently disabled. See comments above for the full test suite.
  });
});
