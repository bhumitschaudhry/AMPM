# Integration Testing

This document describes the integration testing patterns, conventions, and infrastructure used across the AMPM codebase.

---

## Overview

AMPM uses **Vitest** as the sole test runner across all three packages (client, server, worker). Integration tests verify that multiple components work together correctly by testing complete workflows end-to-end while mocking only external infrastructure (databases, AI APIs, object storage).

The codebase contains **20 test files** with four distinct integration test patterns:

| Pattern                       | Package | What It Tests                                 |
| ----------------------------- | ------- | --------------------------------------------- |
| Full HTTP Integration         | server  | Complete auth flows via live HTTP endpoints   |
| Pipeline Integration          | worker  | Image processing pipeline with mocked AI APIs |
| Router Structure Verification | server  | API surface contract stability                |
| React Component Integration   | client  | Page rendering, routing, and user flows       |

---

## Testing Framework

### Vitest Configuration

**Client** has an explicit Vitest config (`client/vitest.config.ts`):

- Environment: `jsdom` (browser-like DOM)
- Globals: `true` (no need to import `describe`, `it`, `expect`)
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`)
- Includes: `src/**/*.test.{ts,tsx}`

**Server and Worker** use Vitest defaults:

- Auto-discovered `__tests__/` directories
- Node environment
- No explicit config file

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npx vitest run auth-flow.test.ts

# Run tests matching a pattern
npx vitest run -t "should rotate tokens"
```

Run these commands from within `client/`, `server/`, or `worker/` directories.

---

## Integration Test Patterns

### Pattern A: Full HTTP Integration

**Example:** `server/src/__tests__/auth-flow.test.ts`

This pattern spins up a real Express server and tests complete workflows via HTTP requests.

**Key characteristics:**

- Real HTTP server on random port: `app.listen(0)`
- Native `fetch()` for HTTP requests
- Only external infrastructure is mocked (Prisma database)
- Tests complete user flows (signup → login → token rotation → logout)

**Setup:**

The server is created fresh inside `beforeEach` for test isolation, and torn down in `afterAll`:

```typescript
let server: Server;
let baseUrl: string;

beforeEach(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}/api/auth`;
});

afterAll(() => server?.close());
```

**Mocking external dependencies:**

```typescript
vi.mock('../db', () => ({
  default: {
    user: {
      create: vi.fn(/* ... */),
      findUnique: vi.fn(/* ... */),
      update: vi.fn(/* ... */),
    },
  },
}));
```

**Making HTTP requests:**

```typescript
const response = await fetch(`${baseUrl}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const data = await response.json();
expect(response.status).toBe(201);
expect(data.accessToken).toBeDefined();
```

---

### Pattern B: Pipeline Integration with Mocked APIs

**Example:** `worker/src/__tests__/process-image.test.ts`

This pattern tests complete worker processing pipelines by mocking external services.

**Key characteristics:**

- Imports real processing functions via static imports (after top-level `vi.mock()` calls)
- Mocks individual pipeline modules (`generate-caption`, `detect-labels`, `check-content-safety`), database (Prisma), object storage (R2), and image processing (Sharp)
- Tests status transitions, error handling, retry logic, and notification creation

**Mocking external dependencies:**

```typescript
vi.mock('../db', () => ({/* ... */}));
vi.mock('../storage/r2-client', () => ({
  downloadFromR2: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
}));
vi.mock('sharp', () => ({
  default: vi.fn(() => ({ toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed')) })),
}));
vi.mock('../pipeline/generate-caption', () => ({
  generateCaption: vi.fn().mockResolvedValue('a photo of a cat'),
}));
vi.mock('../pipeline/detect-labels', () => ({
  detectLabels: vi.fn().mockResolvedValue([{ name: 'Cat', score: 0.95 }]),
}));
vi.mock('../pipeline/check-content-safety', () => ({
  checkContentSafety: vi.fn().mockResolvedValue({ isSafe: true, flaggedCategory: null }),
}));

// Static import — safe because vi.mock() calls are hoisted above imports
import { processImage } from '../process-image';
```

**Testing error scenarios:**

```typescript
it('should mark job FAILED when content is unsafe', async () => {
  vi.mocked(checkContentSafety).mockResolvedValueOnce({
    isSafe: false,
    flaggedCategory: 'adult',
  });

  await processImage(mockJob);
  expect(vi.mocked(prisma.image.update)).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
  );
});
```

---

### Pattern C: Router Structure Verification

**Example:** `server/src/__tests__/job-routes.test.ts`

This pattern verifies the API surface without testing business logic, acting as a contract test.

**Key characteristics:**

- Imports Express router with necessary mocks
- Inspects `router.stack` to verify route paths and HTTP methods
- Ensures API surface remains stable across changes

**Verification approach:**

```typescript
import jobRouter from '../routes/job-routes';

it('should register expected routes', () => {
  const routes = jobRouter.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  expect(routes).toContainEqual(expect.objectContaining({ path: '/', methods: ['post'] }));
  expect(routes).toContainEqual(expect.objectContaining({ path: '/', methods: ['get'] }));
});
```

---

### Pattern D: React Component Integration

**Example:** `client/src/App.test.tsx`, `client/src/pages/LoginPage.test.tsx`, `client/src/pages/ClerkCallbackPage.test.tsx`

This pattern tests rendered React components with provider wrappers.

**Key characteristics:**

- Uses `@testing-library/react` for rendering and assertions
- Wraps components in necessary providers (`MemoryRouter`, `GoogleOAuthProvider`)
- Mocks API calls and environment variables
- Tests DOM output and routing behavior

**Setup with providers:**

```typescript
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

const renderWithProviders = (ui: React.ReactElement, options?: RenderOptions) => {
  return render(
    <GoogleOAuthProvider clientId="test-client-id">
      <MemoryRouter>{ui}</MemoryRouter>
    </GoogleOAuthProvider>,
    options
  );
};
```

**Mocking API calls:**

```typescript
vi.mock('../api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));
```

**Testing routing:**

```typescript
it("should redirect to login when no token", () => {
  renderWithProviders(<App />, { initialEntries: ["/"] });
  expect(screen.getByText(/sign in/i)).toBeInTheDocument();
});
```

---

## Mocking Best Practices

### Vitest Mocking APIs

- **`vi.mock(modulePath, factory)`**: Module-level mocking (hoisted to top)
- **`vi.fn(impl)`**: Create mock functions with optional implementation
- **`vi.mocked(fn)`**: Type-safe access to mock methods
- **`vi.clearAllMocks()`**: Reset all mocks between tests
- **`vi.stubEnv(key, value)`**: Stub environment variables

### Mock Factory Hoisting

Vitest hoists `vi.mock()` calls to the top of the file. Mock factories must be self-contained:

```typescript
// ✓ Correct - factory is self-contained
vi.mock('../db', () => ({
  default: {
    user: { create: vi.fn() },
  },
}));

// ✗ Incorrect - factory references external variable
const mockDb = { user: { create: vi.fn() } };
vi.mock('../db', () => mockDb);
```

### Mocking Type Safety

Use `vi.mocked()` for type-safe mock access:

```typescript
import axios from 'axios';
vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);
mockedAxios.post.mockResolvedValue({ data: { result: 'success' } });
```

### Reset State Between Tests

Always reset mocks in `beforeEach`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  // Reset any module-level state
});
```

---

## Writing New Integration Tests

### Server Tests

1. Create test file in `server/src/__tests__/` with `.test.ts` suffix
2. Mock only external infrastructure (Prisma, Redis, R2)
3. Use real Express routes and middleware
4. Test complete request/response cycles

### Worker Tests

1. Create test file in `worker/src/__tests__/` with `.test.ts` suffix
2. Mock AI APIs (Axios), database (Prisma), storage (R2), and image processing (Sharp)
3. Use dynamic imports after mock setup
4. Test status transitions and error scenarios

### Client Tests

1. Create test file next to component with `.test.tsx` suffix
2. Wrap components in necessary providers
3. Mock API calls via `vi.mock('../api')`
4. Use `@testing-library/react` queries (`getByRole`, `getByText`, etc.)

---

## Examples

### Complete Auth Flow Test (Server)

```typescript
describe('Auth Flow Integration', () => {
  it('should complete full signup and token rotation cycle', async () => {
    // 1. Register new user
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'Password123' }),
    });
    expect(registerResponse.status).toBe(201);
    const { accessToken, refreshToken } = await registerResponse.json();

    // 2. Use access token to access protected route
    const profileResponse = await fetch(`${baseUrl}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(profileResponse.status).toBe(200);

    // 3. Refresh tokens
    const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(refreshResponse.status).toBe(200);
    const newTokens = await refreshResponse.json();

    // 4. Old refresh token should be invalidated
    const oldRefreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    expect(oldRefreshResponse.status).toBe(401);
  });
});
```

### Image Processing Pipeline Test (Worker)

```typescript
describe('processImage Integration', () => {
  it('should process valid image through full pipeline', async () => {
    // Mock successful AI responses
    mockedAxios.post
      .mockResolvedValueOnce({ data: [{ generated_text: 'A sunset over mountains' }] })
      .mockResolvedValueOnce({ data: { labelAnnotations: [{ description: 'nature' }] } })
      .mockResolvedValueOnce({ data: { safeSearchDetection: { adult: 'very_unlikely' } } });

    const result = await processImage({
      jobId: 'job-123',
      imageUrl: 'https://storage.example.com/image.jpg',
      userId: 'user-456',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.caption).toBe('A sunset over mountains');
    expect(result.labels).toContain('nature');
    expect(result.isSafe).toBe(true);
  });

  it('should flag unsafe content and create notification', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { safeSearchDetection: { adult: 'very_likely' } },
    });

    const result = await processImage(unsafeJobData);

    expect(result.status).toBe('COMPLETED');
    expect(result.isSafe).toBe(false);
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });
});
```

---

## Troubleshooting

### Mock Not Being Applied

If mocks aren't working, ensure:

- `vi.mock()` is at the top level (not inside functions)
- Using dynamic `import()` after mock setup for worker tests
- Mock factory is self-contained (no external references)

### Tests Failing in CI but Passing Locally

- Check for environment-specific variables
- Ensure all external services are mocked
- Verify test isolation (no shared state between tests)

### Slow Test Execution

- Use `vi.clearAllMocks()` instead of `vi.resetAllMocks()` when possible
- Mock heavy external dependencies (file I/O, network calls)
- Consider test parallelization for independent tests

---

## Further Reading

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library React](https://testing-library.com/docs/react-testing-library/intro/)
- [Project Architecture](../architecture.md)
- [API Reference](api.md)
