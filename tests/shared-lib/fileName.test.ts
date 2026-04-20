// tests/shared-lib/fileName.test.ts
// file-name slug helpers

import { describe, it, expect } from 'vitest'
import { toFileBase } from '~/shared/lib/fileName'

describe('toFileBase', () =>
{
  it('converts a normal title to a URL-safe slug', () =>
  {
    expect(toFileBase('My Tier List')).toBe('my-tier-list')
  })

  it('returns fallback for whitespace-only input', () =>
  {
    expect(toFileBase('   ')).toBe('tier-list')
  })
})
