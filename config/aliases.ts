// config/aliases.ts
// shared module alias config used by both Vite & Vitest. export one alias
// array for both configs so new aliases only need to be added in one place

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const srcRoot = path.resolve(repoRoot, 'src')
const contractsRoot = path.resolve(repoRoot, 'packages/contracts')

// ~/ -> src/
const sourceAlias = {
  find: /^~\//,
  replacement: `${srcRoot}/`,
}
// resolve subpath imports like @tierlistbuilder/contracts/workspace/board
const contractsSubpathAlias = {
  find: /^@tierlistbuilder\/contracts\/(.*)$/,
  replacement: `${contractsRoot}/$1`,
}

// vite & vitest both accept the array form of alias entries
export const moduleAliases = [sourceAlias, contractsSubpathAlias]
