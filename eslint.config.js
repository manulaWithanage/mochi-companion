import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out/**', '**/build/**', '**/node_modules/**', '**/*.d.ts'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // RULE: `any` requires a comment explaining why.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---------------------------------------------------------------------------
  // KICKOFF PROMPT RULE 2 — packages/core is pure TypeScript.
  // Enforced here so it fails CI rather than relying on discipline.
  // ---------------------------------------------------------------------------
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'packages/core must not import electron (RULE 2).' },
            { name: 'next', message: 'packages/core must not import next (RULE 2).' },
            {
              name: 'better-sqlite3',
              message:
                'packages/core defines the StorageAdapter interface; apps/desktop implements it with better-sqlite3 (RULE 2).',
            },
          ],
          patterns: [
            {
              group: ['node:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'crypto', 'http*'],
              message:
                'packages/core performs no disk or network I/O. Inject an interface instead (RULE 2).',
            },
          ],
        },
      ],
    },
  },

  // Main process legitimately needs Node builtins and console output.
  {
    files: ['apps/desktop/src/main/**/*.ts', 'apps/desktop/src/preload/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Build-time scripts run under plain Node and print progress.
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
