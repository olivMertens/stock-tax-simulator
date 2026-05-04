import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow underscore-prefixed unused args (e.g. `_holdingPeriod` for documented but unused params)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // ESLint 10 / react-hooks v6 ships a new rule that flags `setState` calls inside
      // `useEffect`. Several legitimate sync patterns (e.g. resetting local state when a
      // prop changes, fetching on mount) trip it. Downgraded to a warning so we can adopt
      // the upgrade now and refactor the call sites incrementally.
      // TODO: refactor the 6 flagged sites and re-enable as 'error'.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
