import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.wxt/**',
      '.output/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.desktop-test-results/**',
      '.worktrees/**',
      'desktop/dist/**',
      'desktop/src-tauri/target/**',
      'desktop/src-tauri/gen/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
