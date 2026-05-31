// src/features/platform/auth/model/accountProfileDraft.ts
// pure account profile draft normalization, merging, & update diff helpers

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { normalizeHandleInput } from '@tierlistbuilder/contracts/platform/user'
import { getDisplayName } from './userIdentity'

export interface ProfileDraft
{
  handle: string
  displayName: string
  bio: string
  location: string
  pronouns: string
}

type ProfileUpdateDiff = Partial<ProfileDraft>

const PROFILE_DRAFT_FIELDS = [
  'handle',
  'displayName',
  'bio',
  'location',
  'pronouns',
] as const satisfies readonly (keyof ProfileDraft)[]

const trimmed = (raw: string): string => raw.trim()

const PROFILE_FIELD_NORMALIZERS: Record<
  keyof ProfileDraft,
  (raw: string) => string
> = {
  handle: normalizeHandleInput,
  displayName: trimmed,
  bio: trimmed,
  location: trimmed,
  pronouns: trimmed,
}

export const buildProfileDraft = (user: PublicUserMe): ProfileDraft => ({
  handle: user.handle ?? '',
  displayName: getDisplayName(user, '', { email: 'omit' }),
  bio: user.bio ?? '',
  location: user.location ?? '',
  pronouns: user.pronouns ?? '',
})

const normalizeProfileDraftField = <K extends keyof ProfileDraft>(
  field: K,
  value: ProfileDraft[K]
): ProfileDraft[K] => PROFILE_FIELD_NORMALIZERS[field](value) as ProfileDraft[K]

export const profileDraftsEqual = (
  left: ProfileDraft,
  right: ProfileDraft
): boolean =>
  PROFILE_DRAFT_FIELDS.every((field) => left[field] === right[field])

export const mergeCleanProfileFields = (
  current: ProfileDraft,
  fresh: ProfileDraft,
  synced: ProfileDraft
): ProfileDraft =>
{
  let changed = false
  const next = { ...current }
  for (const field of PROFILE_DRAFT_FIELDS)
  {
    if (current[field] === synced[field] && current[field] !== fresh[field])
    {
      next[field] = fresh[field]
      changed = true
    }
  }
  return changed ? next : current
}

export const getProfileUpdateDiff = (
  draft: ProfileDraft,
  initial: ProfileDraft
): ProfileUpdateDiff =>
{
  const diff: ProfileUpdateDiff = {}
  for (const field of PROFILE_DRAFT_FIELDS)
  {
    const next = normalizeProfileDraftField(field, draft[field])
    if (next !== normalizeProfileDraftField(field, initial[field]))
    {
      diff[field] = next
    }
  }
  return diff
}

export const isProfileDraftValid = (draft: ProfileDraft): boolean =>
  normalizeProfileDraftField('displayName', draft.displayName).length > 0
