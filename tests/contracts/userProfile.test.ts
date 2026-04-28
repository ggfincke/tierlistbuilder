// tests/contracts/userProfile.test.ts
// public profile constants & handle input normalization

import { describe, expect, it } from 'vitest'
import {
  HANDLE_REGEX,
  MAX_HANDLE_LENGTH,
  RESERVED_HANDLES,
  normalizeHandleInput,
} from '@tierlistbuilder/contracts/platform/user'

describe('public profile contract helpers', () =>
{
  it('normalizes handle input for the account form', () =>
  {
    expect(normalizeHandleInput(' Alice Example! ')).toBe('aliceexample')
    expect(normalizeHandleInput('A_B-c')).toBe('a_b-c')
  })

  it('caps handle input and shares the server regex', () =>
  {
    const raw = 'a'.repeat(MAX_HANDLE_LENGTH + 10)
    const normalized = normalizeHandleInput(raw)

    expect(normalized).toHaveLength(MAX_HANDLE_LENGTH)
    expect(HANDLE_REGEX.test(normalized)).toBe(true)
    expect(RESERVED_HANDLES).toContain('settings')
  })
})
