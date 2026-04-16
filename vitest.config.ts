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
  },
})
