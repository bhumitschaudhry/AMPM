import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Load the development build of React for tests. React's production build
// omits `act`, which @testing-library/react requires, causing
// "React.act is not a function".
if (process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'development';
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
