# Clerk Google OAuth Design

## Goal

Add Google sign-in through Clerk while preserving AMPM's existing email/password authentication, local JWT access and refresh tokens, and protected API behavior.

## Chosen approach

Use Clerk only for Google identity verification and use a server-side exchange to issue the AMPM JWT pair already consumed by the client and API.

The browser signs in with Clerk, obtains the current Clerk session token, and sends it to `POST /api/auth/clerk`. The API verifies the token with Clerk's backend SDK, requires a verified email, creates or finds an OAuth-only AMPM user, and returns the existing access and refresh tokens. After the exchange, the client stores those tokens exactly as it does for local login.

This keeps the current JWT middleware, token rotation, logout revocation, route protection, and existing local accounts unchanged.

## Data model

Extend `User` with:

- `clerkUserId String? @unique` mapped to `clerk_user_id`.
- `passwordHash String?` so a Google-only account does not need a local password.

The migration must preserve all existing password hashes and users.

When the Clerk exchange succeeds:

1. Find the user by Clerk user ID.
2. If no user exists, look up the verified Clerk email.
3. If that email belongs to an existing local-password user, reject the exchange with a conflict and instruct the user to sign in with the existing email/password account. Do not silently link identities.
4. If no email match exists, create an OAuth-only user with the Clerk ID and a null password hash.
5. Issue the normal AMPM access and refresh tokens.

The local `/login` route must reject OAuth-only users with the same generic invalid-credentials response used for unknown users, without exposing account type.

## Server behavior

Add `POST /api/auth/clerk`:

- Read a Clerk session token from the `Authorization: Bearer <token>` header.
- Verify it with `@clerk/backend` using the configured Clerk secret key.
- Require a verified primary email from the verified Clerk claims.
- Apply the user lookup/creation rules above.
- Return `{ accessToken, refreshToken, user: { id, email } }`.
- Return actionable errors for missing credentials, invalid/expired Clerk tokens, missing verified email, and email conflicts.
- Never log Clerk tokens or other credential material.

The endpoint must not use AMPM's `authenticateToken` middleware because its input is a Clerk token, not an AMPM JWT. All endpoints after the exchange continue using `authenticateToken`.

## Client behavior

- Wrap the app in `ClerkProvider` using `VITE_CLERK_PUBLISHABLE_KEY`.
- Add a Google sign-in action to the login page through Clerk's redirect-based OAuth flow.
- Add a Clerk SSO callback route that waits for Clerk's redirect completion, gets the Clerk session token, calls `/api/auth/clerk`, stores the returned AMPM tokens, and navigates to `/`.
- Display the server's actionable error on the login page and leave the existing email/password form available.
- Do not use Clerk's session as the application's route-protection state; AMPM's stored access token remains the source of truth for existing protected routes.

If Clerk is not configured, the local email/password flow must remain usable and the Google action should explain that Google sign-in is not configured rather than crashing the app.

## Configuration and documentation

Document these variables in `.env.example`, Docker Compose, and the setup instructions:

- `CLERK_SECRET_KEY` for the API server.
- `VITE_CLERK_PUBLISHABLE_KEY` for the Vite client.

The documentation will explain enabling Google in the Clerk dashboard and registering the local callback URL. No secrets are committed.

## Testing

Server tests will cover:

- The route is registered as `POST /clerk`.
- Missing or malformed bearer credentials are rejected.
- Invalid Clerk verification is rejected.
- A verified new Clerk identity creates an OAuth-only user and returns AMPM tokens.
- A known Clerk identity returns tokens without creating a duplicate.
- A verified email collision with a local account is rejected.
- A local login cannot authenticate an OAuth-only user.

Client tests will cover:

- The login page renders a Google sign-in action alongside the existing form.
- The callback exchanges the Clerk token and stores the AMPM token pair.
- Exchange failures are shown to the user.

Run server and client test suites, typechecks, and production builds before committing the implementation.

## Out of scope

- Replacing AMPM JWTs with Clerk tokens throughout the API.
- Adding password creation or password recovery for OAuth-only users.
- Linking a Google identity to an existing local account automatically.
- Supporting providers other than Google.
- Adding a separate user-identity table before a second provider requires it.
