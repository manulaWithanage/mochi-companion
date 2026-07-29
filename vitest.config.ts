import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // packages/core must be testable with no Electron process running (RULE 2).
    environment: 'node',
    include: ['packages/**/src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/types/**'],
      thresholds: {
        // The governor and timer logic are the highest-risk code in the repo.
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
