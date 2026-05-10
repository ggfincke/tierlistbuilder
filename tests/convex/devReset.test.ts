// tests/convex/devReset.test.ts
// schema/reset table coverage guard for the dev wipe action

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkspaceFile = (path: string): string => readFileSync(path, 'utf-8')

const extractResettableTables = (): Set<string> =>
{
  const source = readWorkspaceFile('convex/dev/reset.ts')
  const match = source.match(
    /const RESETTABLE_TABLES = \[([\s\S]*?)\] as const/
  )
  if (!match) throw new Error('RESETTABLE_TABLES not found')
  return new Set(Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1]))
}

const extractSchemaTables = (): string[] =>
{
  const source = readWorkspaceFile('convex/schema.ts')
  return Array.from(
    source.matchAll(/^\s{2}([a-z][A-Za-z0-9]*): defineTable/gm),
    (item) => item[1]
  )
}

describe('dev reset table coverage', () =>
{
  it('includes every user table declared in the Convex schema', () =>
  {
    const resettable = extractResettableTables()
    const missing = extractSchemaTables().filter(
      (table) => !resettable.has(table)
    )

    expect(missing).toEqual([])
  })
})
