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
    const packageJson = readWorkspaceFile('package.json')

    expect(source).toContain('internalMutation')
    expect(source).not.toMatch(/\bmutation\(/)
    expect(source).toContain('CONVEX_TLOTL_SAMPLE_SEED_ALLOWED')
    expect(source).not.toContain('SEED-TLOTL-')
    expect(packageJson).not.toContain('SEED-TLOTL-')
  })

  it('runs the gated tlotl sample seed last in the default seed', () =>
  {
    const packageJson = JSON.parse(readWorkspaceFile('package.json')) as {
      scripts: Record<string, string>
    }

    // tlotl samples derive from the marketplace templates, so they must seed
    // after them; the step still self-gates on CONVEX_TLOTL_SAMPLE_SEED_ALLOWED
    expect(packageJson.scripts['seed:all']).toBe(
      'npm run seed:marketplace && npm run seed:rankings && npm run seed:featured && npm run seed:tlotl'
    )
    expect(packageJson.scripts['seed:tlotl']).toBe(
      'npm run seed:tlotl-samples && npm run seed:tlotl-crop'
    )
  })
})
