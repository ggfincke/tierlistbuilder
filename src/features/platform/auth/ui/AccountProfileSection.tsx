// src/features/platform/auth/ui/AccountProfileSection.tsx
// account profile editor fields, draft merge, & save/reset actions

import { useEffect, useId, useRef, useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_HANDLE_LENGTH,
  MAX_LOCATION_LENGTH,
  PRONOUN_OPTIONS,
  normalizeHandleInput,
} from '@tierlistbuilder/contracts/platform/user'
import {
  buildProfileDraft,
  getProfileUpdateDiff,
  isProfileDraftValid,
  mergeCleanProfileFields,
  profileDraftsEqual,
  type ProfileDraft,
} from '~/features/platform/auth/model/accountProfileDraft'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'
import { AccountField } from './AccountField'

interface AccountProfileSectionProps
{
  user: PublicUserMe
}

export const AccountProfileSection = ({ user }: AccountProfileSectionProps) =>
{
  const updateProfile = useMutation(api.users.updateProfile)
  const [initial, setInitial] = useState<ProfileDraft>(() =>
    buildProfileDraft(user)
  )
  const lastSyncedRef = useRef<ProfileDraft>(initial)
  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [saving, setSaving] = useState(false)

  const handleId = useId()
  const nameId = useId()
  const bioId = useId()
  const locationId = useId()
  const pronounsId = useId()
  const emailId = useId()
  const providerId = useId()

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

  const handleSave = async () =>
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

  const handleReset = () =>
  {
    setDraft(initial)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccountField
          labelId={handleId}
          label="Handle"
          hint="Used in your profile URL"
        >
          <div className="flex w-full items-center gap-2 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2.5 py-1.5 focus-within:border-[var(--t-border-hover)]">
            <span className="text-sm text-[var(--t-text-faint)]" aria-hidden>
              @
            </span>
            <input
              id={handleId}
              type="text"
              value={draft.handle}
              maxLength={MAX_HANDLE_LENGTH}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  handle: normalizeHandleInput(event.target.value),
                }))
              }
              disabled={saving}
              placeholder="yourhandle"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-faint)]"
            />
          </div>
        </AccountField>

        <AccountField labelId={nameId} label="Display name">
          <TextInput
            id={nameId}
            className="w-full"
            value={draft.displayName}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
            disabled={saving}
          />
        </AccountField>
      </div>

      <AccountField
        labelId={bioId}
        label="Bio"
        hint={`${draft.bio.length}/${MAX_BIO_LENGTH}`}
      >
        <TextArea
          id={bioId}
          rows={3}
          className="w-full resize-y"
          value={draft.bio}
          maxLength={MAX_BIO_LENGTH}
          placeholder="Tell people what kinds of lists you make."
          onChange={(event) =>
            setDraft((current) => ({ ...current, bio: event.target.value }))
          }
          disabled={saving}
        />
      </AccountField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccountField labelId={locationId} label="Location">
          <TextInput
            id={locationId}
            className="w-full"
            value={draft.location}
            maxLength={MAX_LOCATION_LENGTH}
            placeholder="Earth"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                location: event.target.value,
              }))
            }
            disabled={saving}
          />
        </AccountField>
        <AccountField labelId={pronounsId} label="Pronouns">
          <select
            id={pronounsId}
            value={draft.pronouns}
            disabled={saving}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                pronouns: event.target.value,
              }))
            }
            className="focus-custom w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--t-text)] focus:border-[var(--t-border-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Not specified</option>
            {PRONOUN_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </AccountField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AccountField labelId={emailId} label="Email">
          <p
            id={emailId}
            className="select-text truncate rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2.5 py-1.5 text-sm text-[var(--t-text-secondary)]"
          >
            {user.email ?? 'No email on file'}
          </p>
        </AccountField>

        <AccountField labelId={providerId} label="Sign-in method">
          <p
            id={providerId}
            className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2.5 py-1.5 text-sm text-[var(--t-text-secondary)]"
          >
            Email &amp; password
          </p>
        </AccountField>
      </div>

      {dirty && (
        <div className="flex items-center gap-2 pt-1">
          <PrimaryButton
            size="sm"
            onClick={() =>
            {
              void handleSave()
            }}
            disabled={saving || displayNameInvalid}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </PrimaryButton>
          <SecondaryButton size="sm" onClick={handleReset} disabled={saving}>
            Reset
          </SecondaryButton>
          {displayNameInvalid && (
            <span className="text-xs text-[var(--t-text-faint)]">
              Display name is required
            </span>
          )}
        </div>
      )}
    </div>
  )
}
