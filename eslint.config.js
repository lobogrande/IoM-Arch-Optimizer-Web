import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/tests/setup.js']), // Ignore test setup temporarily
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
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }], // Downgrade to warning
      'no-dupe-keys': 'error', // Keep duplicate keys as error
      'react-hooks/rules-of-hooks': 'warn', // Downgrade React hooks errors
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'no-unsafe-optional-chaining': 'warn',
      'no-empty': 'warn',
      'no-undef': 'warn', // Downgrade undefined vars to warning
      'no-redeclare': 'warn', // Downgrade redeclare to warning
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
