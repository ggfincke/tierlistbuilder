// tests/platform/accountProfileDraft.test.ts
// account profile draft normalization, merge, & update diff helpers

import { describe, expect, it } from 'vitest'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  buildProfileDraft,
  getProfileUpdateDiff,
  isProfileDraftValid,
  mergeCleanProfileFields,
  normalizeProfileDraftField,
  profileDraftsEqual,
  type ProfileDraft,
} from '~/features/platform/auth/model/accountProfileDraft'

const makeUser = (overrides: Partial<PublicUserMe> = {}): PublicUserMe => ({
  _id: 'user-1',
  email: 'person@example.com',
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
  pronouns: null,
  ...overrides,
})

const draft = (overrides: Partial<ProfileDraft> = {}): ProfileDraft => ({
  handle: 'alice',
  displayName: 'Alice',
  bio: '',
  location: '',
  pronouns: '',
  ...overrides,
})

describe('account profile draft helpers', () =>
{
  it('builds editable drafts without falling back to email as display name', () =>
  {
    expect(buildProfileDraft(makeUser())).toEqual(
      draft({ handle: '', displayName: '' })
    )
    expect(
      buildProfileDraft(
        makeUser({
          displayName: 'Display',
          handle: 'person',
          bio: 'Bio',
          location: 'Moon',
          pronouns: 'they/them',
        })
      )
    ).toEqual(
      draft({
        handle: 'person',
        displayName: 'Display',
        bio: 'Bio',
        location: 'Moon',
        pronouns: 'they/them',
      })
    )
  })

  it('normalizes handle and trims other diff fields', () =>
  {
    expect(normalizeProfileDraftField('handle', ' Alice Example! ')).toBe(
      'aliceexample'
    )

    expect(
      getProfileUpdateDiff(
        draft({
          handle: ' New_Handle ',
          displayName: ' Alice B ',
          bio: ' Bio ',
        }),
        draft()
      )
    ).toEqual({
      handle: 'new_handle',
      displayName: 'Alice B',
      bio: 'Bio',
    })
  })

  it('keeps dirty fields while merging fresh server state into clean fields', () =>
  {
    const synced = draft({ bio: 'old bio', location: 'old place' })
    const current = draft({
      displayName: 'Draft Name',
      bio: 'old bio',
      location: 'local edit',
    })
    const fresh = draft({
      displayName: 'Server Name',
      bio: 'server bio',
      location: 'server place',
    })

    expect(mergeCleanProfileFields(current, fresh, synced)).toEqual(
      draft({
        displayName: 'Draft Name',
        bio: 'server bio',
        location: 'local edit',
      })
    )
  })

  it('compares drafts and validates required display name', () =>
  {
    expect(profileDraftsEqual(draft(), draft())).toBe(true)
    expect(profileDraftsEqual(draft(), draft({ bio: 'x' }))).toBe(false)
    expect(isProfileDraftValid(draft({ displayName: ' Alice ' }))).toBe(true)
    expect(isProfileDraftValid(draft({ displayName: '   ' }))).toBe(false)
  })
})
