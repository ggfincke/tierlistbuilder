// vitest.config.ts
// Vitest config — mirror the app source alias for unit tests

import path from 'node:path'
import { defineConfig } from 'vitest/config'

const srcRoot = path.resolve(__dirname, './src')
const sourceAlias = {
  find: /^@\//,
  replacement: `${srcRoot}/`,
}

export default defineConfig({
  resolve: {
    alias: [sourceAlias],
  },
  test: {
    alias: [sourceAlias],
  },
})
