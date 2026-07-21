// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { getBaseConfig } from '../eslint.config.mjs';

export default defineConfig(...getBaseConfig(js, tseslint), {
  files: ['**/*.ts'],
  rules: {
    // Control-char regexes are deliberate in sanitization helpers.
    'no-control-regex': 'off',
  },
});
