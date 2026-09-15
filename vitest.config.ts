import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'tests/helpers/**/*.test.ts'], environment: 'node' },
});
