// @ts-check

/**
 * Shared ESLint base configuration.
 * Exposes a function so package-level ESLint versions can inject their own local
 * dependencies (@eslint/js and typescript-eslint) without requiring a root-level node_modules
 * in all environments (like CI).
 *
 * @param {any} js @eslint/js config object
 * @param {any} tseslint typescript-eslint helper/config object
 */
export const getBaseConfig = (js, tseslint) => [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
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
];
