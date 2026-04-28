// tests/platform/userIdentity.test.ts
// public user identity display helpers

import { describe, expect, it } from 'vitest'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  getDisplayName,
  getUserInitial,
  getUserStableId,
} from '~/features/platform/auth/model/userIdentity'

const makeUser = (overrides: Partial<PublicUserMe>): PublicUserMe => ({
  _id: 'user-1',
  email: null,
  name: null,
  displayName: null,
  image: null,
  externalId: null,
  tier: 'free',
  createdAt: 1,
  updatedAt: null,
  handle: null,
  bio: null,
  location: null,
  website: null,
  pronouns: null,
  ...overrides,
})

describe('user identity helpers', () =>
{
  it('prefers displayName over name and email', () =>
  {
    const user = makeUser({
      displayName: 'Display',
      name: 'Name',
      email: 'person@example.com',
    })

    expect(getDisplayName(user)).toBe('Display')
    expect(getUserInitial(user)).toBe('D')
  })

  it('supports full, local, and omitted email fallback modes', () =>
  {
    const user = makeUser({ email: 'person@example.com' })

    expect(getDisplayName(user)).toBe('person@example.com')
    expect(getDisplayName(user, '', { email: 'local' })).toBe('person')
    expect(getDisplayName(user, 'Signed in', { email: 'omit' })).toBe(
      'Signed in'
    )
  })

  it('uses the Convex row id as the stable sync identity', () =>
  {
    expect(
      getUserStableId(
        makeUser({ _id: 'internal-user', externalId: 'user_public_1' })
      )
    ).toBe('internal-user')
    expect(getUserStableId(makeUser({ _id: 'fallback-user' }))).toBe(
      'fallback-user'
    )
  })
})
