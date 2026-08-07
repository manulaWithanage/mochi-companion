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

  /*
   * No em dashes in anything a user reads.
   *
   * An em dash joining two clauses is the surest tell that a sentence was
   * generated, and this is a guard rather than a preference because a sweep
   * does not hold. Thirty-four were removed from the interface on 2026-08-07
   * and four more had appeared by the end of the same day, written by whoever
   * touched those files next. Nobody is going to remember a style rule that
   * only exists in a document.
   *
   * Scoped to the files that produce user-visible text. Log lines and comments
   * are read by whoever works on this, not by users, and are left alone.
   *
   * Regex literals are not matched: `Literal[value=...]` compares a string, and
   * a regex literal's `value` is a RegExp. That is deliberate — the two places
   * that legitimately contain an em dash are both patterns, one stripping them
   * out of speech and one splitting window titles on them.
   *
   * En dashes are allowed. `09:00 – 17:00` is a range, correct typography, and
   * not what anybody means by "this reads like it was generated".
   */
  {
    files: [
      'apps/desktop/src/renderer/**/*.ts',
      'apps/desktop/src/renderer/**/*.tsx',
      'packages/core/src/routines/**/*.ts',
      'packages/core/src/messages/**/*.ts',
      'packages/core/src/google/oauth.ts',
      'packages/core/src/google/reply-queue.ts',
      'packages/core/src/updater/status.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\u2014/]',
          message:
            'No em dashes in user-facing text. Use a full stop where the second half is its own thought, a colon where it explains the first.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\u2014/]',
          message:
            'No em dashes in user-facing text. Use a full stop where the second half is its own thought, a colon where it explains the first.',
        },
        {
          selector: 'JSXText[value=/\\u2014/]',
          message:
            'No em dashes in user-facing text. Use a full stop where the second half is its own thought, a colon where it explains the first.',
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-imports': 'off',
      // Tests assert on the copy, so they must be able to quote what they pin.
      'no-restricted-syntax': 'off',
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
