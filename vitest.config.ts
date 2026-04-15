// vitest.config.ts
// Vitest config — mirror the app source alias for unit tests

import path from 'node:path'
import { defineConfig } from 'vitest/config'

const srcRoot = path.resolve(__dirname, './src')
const convexRoot = path.resolve(__dirname, './convex')
const contractsRoot = path.resolve(__dirname, './packages/contracts')
const sourceAlias = {
  find: /^@\//,
  replacement: `${srcRoot}/`,
}
const convexAlias = {
  find: /^@convex\//,
  replacement: `${convexRoot}/`,
}
const contractsSubpathAlias = {
  find: /^@tierlistbuilder\/contracts\/(.*)$/,
  replacement: `${contractsRoot}/$1`,
}
const contractsBarrelAlias = {
  find: /^@tierlistbuilder\/contracts$/,
  replacement: `${contractsRoot}/index.ts`,
}
const aliases = [
  sourceAlias,
  convexAlias,
  contractsSubpathAlias,
  contractsBarrelAlias,
]

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    alias: aliases,
  },
})
