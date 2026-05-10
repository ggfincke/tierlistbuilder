// vitest.config.ts
// Vitest config — mirror the app source alias for unit tests

import { defineConfig } from 'vitest/config'
import { moduleAliases } from './config/aliases'

export default defineConfig({
  resolve: {
    alias: moduleAliases,
  },
  test: {
    alias: moduleAliases,
    fileParallelism: false,
    pool: 'threads',
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
      '.claude/**',
      'e2e/**',
    ],
    setupFiles: ['tests/setup.ts'],
  },
})
