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

const appImportPatterns = [
  '~/app/**',
  '../app/**',
  '../../app/**',
  '../../../app/**',
  '../../../../app/**',
  '../../../../../app/**',
  '../../../../../../app/**',
]

const sharedBoundaryImportPatterns = [
  '~/features/**',
  '../features/**',
  '../../features/**',
  '../../../features/**',
  '../../../../features/**',
  '../../../../../features/**',
  '../../../../../../features/**',
  ...appImportPatterns,
]

const workspaceBoardsDataImportPatterns = [
  '~/features/workspace/boards/data/**',
  '../workspace/boards/data/**',
  '../../workspace/boards/data/**',
  '../../../workspace/boards/data/**',
  '../../../../workspace/boards/data/**',
  '../../../../../workspace/boards/data/**',
  '../../../../../../workspace/boards/data/**',
]

const uiDataImportRestriction = {
  group: ['~/features/**/data/**'],
  message:
    'UI/app .tsx files must call model-level facades instead of data modules.',
}

const appImportRestriction = {
  group: appImportPatterns,
  message: 'Feature slices must not import app shell or router code.',
}

const workspaceBoardsDataImportRestriction = {
  group: workspaceBoardsDataImportPatterns,
  message:
    'External slices must use workspace boards model facades instead of board data modules.',
}

const convexUiImportRestriction = {
  group: ['convex/react', '@convex/_generated/api'],
  message:
    'UI/page .tsx files must use model or data hooks instead of Convex directly.',
}

export default defineConfig([
  // exclude build output & generated code from linting
  globalIgnores([
    'dist',
    'convex/_generated',
    '.agents',
    '.claude',
    '.convex',
    '.tmp',
    'skills-lock.json',
  ]),
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      ggfincke: localRules,
    },
    rules: {
      'ggfincke/file-header': 'error',
    },
  },
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
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [uiDataImportRestriction, convexUiImportRestriction],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            uiDataImportRestriction,
            appImportRestriction,
            convexUiImportRestriction,
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [appImportRestriction],
        },
      ],
    },
  },
  {
    files: [
      'src/features/library/**/*.tsx',
      'src/features/marketplace/**/*.tsx',
      'src/features/platform/**/*.tsx',
      'src/features/embed/**/*.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            uiDataImportRestriction,
            appImportRestriction,
            workspaceBoardsDataImportRestriction,
            convexUiImportRestriction,
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/features/library/**/*.ts',
      'src/features/marketplace/**/*.ts',
      'src/features/platform/**/*.ts',
      'src/features/embed/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            appImportRestriction,
            workspaceBoardsDataImportRestriction,
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: sharedBoundaryImportPatterns,
              message: 'Shared modules must stay feature- and app-agnostic.',
            },
            convexUiImportRestriction,
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/platform/sync/orchestration/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/features/workspace/**/data/**'],
              message:
                'Platform sync orchestration must use the workspace sync facade instead of workspace data modules.',
            },
          ],
        },
      ],
    },
  },
])
