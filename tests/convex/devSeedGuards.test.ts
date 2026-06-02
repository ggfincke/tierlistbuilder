// tests/convex/devSeedGuards.test.ts
// static guards for dev-only seed entrypoints

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkspaceFile = (path: string): string => readFileSync(path, 'utf-8')

describe('dev seed guards', () =>
{
  it('keeps the tlotl sample seed internal and without a checked-in token', () =>
  {
    const source = readWorkspaceFile('convex/dev/tlotlSeed.ts')
    const seedGate = readWorkspaceFile('convex/dev/seedGate.ts')
    const packageJson = readWorkspaceFile('package.json')

    expect(source).toContain('internalMutation')
    expect(source).not.toMatch(/\bmutation\(/)
    expect(seedGate).toContain('CONVEX_TLOTL_SAMPLE_SEED_ALLOWED')
    expect(source).not.toContain('SEED-TLOTL-')
    expect(packageJson).not.toContain('SEED-TLOTL-')
  })
})
