// tests/auth/authErrors.test.ts
// Convex Auth error mapping coverage.

import { describe, expect, it } from 'vitest'

import { mapAuthError } from '~/features/platform/auth/model/authErrors'

describe('mapAuthError', () =>
{
  it('maps compact Convex Auth invalid-secret codes to bad credentials copy', () =>
  {
    expect(mapAuthError('InvalidSecret', 'sign-in')).toBe(
      'Wrong email or password.'
    )
  })
})
