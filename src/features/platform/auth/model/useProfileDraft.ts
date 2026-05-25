// src/features/platform/auth/model/useProfileDraft.ts
// account profile draft controller — owns draft state, server-sync merge, & save
// so the Identity editor & the live "how others see you" preview share one source

import { useEffect, useRef, useState } from 'react'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  buildProfileDraft,
  getProfileUpdateDiff,
  isProfileDraftValid,
  mergeCleanProfileFields,
  profileDraftsEqual,
  type ProfileDraft,
} from '~/features/platform/auth/model/accountProfileDraft'
import { useUpdateProfileMutation } from '~/features/platform/auth/model/useAccountMutations'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'

export interface ProfileDraftController
{
  draft: ProfileDraft
  patchDraft: (patch: Partial<ProfileDraft>) => void
  dirty: boolean
  saving: boolean
  displayNameInvalid: boolean
  save: () => Promise<void>
  reset: () => void
}

export const useProfileDraft = (user: PublicUserMe): ProfileDraftController =>
{
  const updateProfile = useUpdateProfileMutation()
  const [initial, setInitial] = useState<ProfileDraft>(() =>
    buildProfileDraft(user)
  )
  const lastSyncedRef = useRef<ProfileDraft>(initial)
  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [saving, setSaving] = useState(false)

  // keep the draft in sync w/ server updates while preserving in-flight edits
  // so a background profile refresh doesn't clobber fields being edited
  useEffect(() =>
  {
    const fresh = buildProfileDraft(user)
    setInitial((current) =>
      profileDraftsEqual(current, fresh) ? current : fresh
    )
    setDraft((current) =>
    {
      const next = mergeCleanProfileFields(
        current,
        fresh,
        lastSyncedRef.current
      )
      return profileDraftsEqual(current, next) ? current : next
    })
    lastSyncedRef.current = fresh
  }, [user])

  const diff = getProfileUpdateDiff(draft, initial)
  const dirty = Object.keys(diff).length > 0
  const displayNameInvalid = !isProfileDraftValid(draft)

  const patchDraft = (patch: Partial<ProfileDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const save = async () =>
  {
    if (!dirty || saving || displayNameInvalid) return
    setSaving(true)
    try
    {
      await updateProfile(diff)
      toast('Profile updated', 'success')
    }
    catch (error)
    {
      toast(formatError(error, 'Failed to update profile'), 'error')
    }
    finally
    {
      setSaving(false)
    }
  }

  const reset = () => setDraft(initial)

  return { draft, patchDraft, dirty, saving, displayNameInvalid, save, reset }
}
