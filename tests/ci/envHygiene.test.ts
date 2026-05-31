// tests/ci/envHygiene.test.ts
// local secret hygiene guard for seed credential placeholders

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const exampleEnvPath = join(repoRoot, '.env.example')
const seedSecretKeys = [
  'CONVEX_SEED_SECRET',
  'CONVEX_SEED_AUTHOR_PASSWORD',
] as const

const dotenvAssignments = (text: string): Map<string, string> =>
{
  const assignments = new Map<string, string>()
  for (const line of text.split(/\r?\n/))
  {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match)
    {
      assignments.set(match[1], match[2])
    }
  }
  return assignments
}

const isGitIgnored = (path: string): boolean =>
{
  try
  {
    execFileSync('git', ['check-ignore', '--quiet', path], {
      cwd: repoRoot,
      stdio: 'ignore',
    })
    return true
  }
  catch
  {
    return false
  }
}

describe('local secret hygiene', () =>
{
  it('keeps seed secrets blank in .env.example', () =>
  {
    const assignments = dotenvAssignments(readFileSync(exampleEnvPath, 'utf8'))

    for (const key of seedSecretKeys)
    {
      expect(assignments.has(key), `${key} must stay documented`).toBe(true)
      expect(assignments.get(key), `${key} must stay blank`).toBe('')
    }
  })

  it('keeps local dotenv files ignored while .env.example remains tracked', () =>
  {
    expect(isGitIgnored('.env'), '.env must stay ignored').toBe(true)
    expect(isGitIgnored('.env.local'), '.env.local must stay ignored').toBe(
      true
    )
    expect(
      isGitIgnored('.env.example'),
      '.env.example must stay commit-able'
    ).toBe(false)
  })
})
