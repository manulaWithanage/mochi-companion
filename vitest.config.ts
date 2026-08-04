import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // packages/core must be testable with no Electron process running (RULE 2).
    environment: 'node',
    include: [
      'packages/**/src/**/*.{test,spec}.ts',
      // Main-process logic that does not import electron is testable too, and
      // some of it — parsing third-party ICS feeds, recurrence expansion — is
      // riskier than anything in core. A test file here must stay
      // electron-free; anything needing the app object belongs behind a
      // service that takes its inputs as arguments.
      'apps/desktop/src/**/*.{test,spec}.ts',
      // Release tooling. It decides what version reaches users, and its failure
      // mode is silent, so it is held to the same standard as the app.
      'scripts/**/*.{test,spec}.ts',
    ],
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
