// eslint.config.js
// ESLint flat config — JS recommended, TypeScript, React hooks, & fast-refresh rules
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettierConfig from 'eslint-config-prettier'
import localRules from './eslint-rules/index.js'

export default defineConfig([
  // exclude build output & generated code from linting
  globalIgnores([
    'dist',
    'convex/_generated',
    '.agents',
    '.claude',
    '.convex',
    'skills-lock.json',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      // warn on components that cannot be fast-refreshed by Vite HMR
      reactRefresh.configs.vite,
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      ggfincke: localRules,
    },
    rules: {
      // custom comment style rules
      'ggfincke/no-jsdoc-blocks': 'error',
      'ggfincke/file-header': 'error',
      'ggfincke/comment-style-guide': 'warn',
      'ggfincke/comment-block-length': 'error',
      'ggfincke/no-unicode-arrow': 'error',
      'no-inline-comments': 'error',
      // honor _-prefix as "intentionally unused" for args, caught errors, & destructured rest siblings
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
])
