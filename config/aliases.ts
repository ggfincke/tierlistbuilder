// config/aliases.ts
// shared module alias config used by both Vite & Vitest. exports an alias
// array compatible w/ both configs — keeping the source of truth in one
// place so a new alias only needs to be added here once

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const srcRoot = path.resolve(repoRoot, 'src')
const convexRoot = path.resolve(repoRoot, 'convex')
const contractsRoot = path.resolve(repoRoot, 'packages/contracts')

// ~/ -> src/
const sourceAlias = {
  find: /^~\//,
  replacement: `${srcRoot}/`,
}
// resolve @convex/_generated/* imports for the typed api & dataModel
const convexAlias = {
  find: /^@convex\//,
  replacement: `${convexRoot}/`,
}
// resolve subpath imports like @tierlistbuilder/contracts/workspace/board
const contractsSubpathAlias = {
  find: /^@tierlistbuilder\/contracts\/(.*)$/,
  replacement: `${contractsRoot}/$1`,
}

// vite & vitest both accept the array form of alias entries
export const moduleAliases = [sourceAlias, convexAlias, contractsSubpathAlias]
