// ESLint, flat config. The current build only: slam/src, slam/tests and slam/tools.
// archive/ is history and is never linted or formatted.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['archive/**', 'node_modules/**', 'slam/tools/gallery/**', 'slam/tools/gallery-approved/**'] },
  js.configs.recommended,
  {
    files: ['slam/src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } }
  },
  {
    files: ['slam/tests/**/*.js', 'slam/tools/**/*.mjs', 'slam/src/data/households/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
  },
  {
    rules: {
      // Underscore-prefixed names are deliberate placeholders (for example in destructuring).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // An empty catch is how the app treats "could not read it" as "not there" (settings, old files).
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
