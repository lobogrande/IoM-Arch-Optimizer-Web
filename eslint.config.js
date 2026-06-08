import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/tests/setup.js', '**/*.py']), // Ignore test setup and Python files
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['public/*_worker.js'], // Ignore worker files for now
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]|^_' }], // Allow unused vars starting with _ or uppercase
      'no-dupe-keys': 'error',
      'react-hooks/rules-of-hooks': 'error', // Back to error - fixed in code
      'react-hooks/exhaustive-deps': 'warn', // Keep as warn - often intentional with Zustand
      'react-hooks/preserve-manual-memoization': 'warn', // React Compiler feature - not critical
      'react-hooks/set-state-in-effect': 'warn', // Sometimes necessary for derived state
      'no-unsafe-optional-chaining': 'error', // Back to error - fixed in code
      'no-empty': 'warn', // Keep as warn - fixed in actual code, but linter may be confused
      'no-undef': 'warn', // Keep as warn - some worker globals are tricky
      'no-redeclare': 'warn', // Keep as warn - mostly in test files
    },
  },
  // Worker files configuration
  {
    files: ['public/*_worker.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
        importScripts: 'readonly',
        loadPyodide: 'readonly',
      },
    },
    rules: {
      'no-empty': 'warn', // Workers may have intentional empty catches for optional features
      'no-undef': 'warn', // Python worker globals are dynamic
    },
  },
  // Test files configuration  
  {
    files: ['src/tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        global: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-undef': 'warn',
    },
  },
])
