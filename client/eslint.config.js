// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // Allow existing `any` usage; tighten incrementally as code is refactored.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow existing namespaces; prefer modules, but don't churn working code.
      '@typescript-eslint/no-namespace': 'off',
      // Allow `_`-prefixed unused vars (often used as deliberately-ignored).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Test files often have legitimate unused imports (type-only, mocks).
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
