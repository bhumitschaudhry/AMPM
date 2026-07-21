// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { getBaseConfig } from '../eslint.config.mjs';

export default defineConfig(...getBaseConfig(js, tseslint));
