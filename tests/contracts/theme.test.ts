// tests/contracts/theme.test.ts
// tier color contract equality helpers

import { describe, expect, it } from 'vitest'

import { tierColorSpecEqual } from '@tierlistbuilder/contracts/lib/theme'

describe('tierColorSpecEqual', () =>
{
  it('treats absent specs as equal', () =>
  {
    expect(tierColorSpecEqual(undefined, null)).toBe(true)
  })

  it('compares palette and custom specs by payload', () =>
  {
    expect(
      tierColorSpecEqual(
        { kind: 'palette', index: 2 },
        { kind: 'palette', index: 2 }
      )
    ).toBe(true)
    expect(
      tierColorSpecEqual(
        { kind: 'custom', hex: '#112233' },
        { kind: 'custom', hex: '#445566' }
      )
    ).toBe(false)
  })
})
