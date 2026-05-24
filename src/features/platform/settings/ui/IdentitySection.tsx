// src/features/platform/settings/ui/IdentitySection.tsx
// identity profile editor (handle, display name, pronouns, location, bio).
// reuses the shared profile-draft model + updateProfile, w/ per-section save.

import { useEffect, useId, useRef, useState } from 'react'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_HANDLE_LENGTH,
  MAX_LOCATION_LENGTH,
  normalizeHandleInput,
  PRONOUN_OPTIONS,
} from '@tierlistbuilder/contracts/platform/user'
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
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import {
  Field,
  SelectField,
  SetSection,
  TextAreaField,
  TextField,
} from './SettingsChrome'

const PRONOUN_SELECT_OPTIONS = [
  { value: '', label: 'Not specified' },
  ...PRONOUN_OPTIONS.map((option) => ({ value: option, label: option })),
]

interface IdentitySectionProps
{
  user: PublicUserMe
}

export const IdentitySection = ({ user }: IdentitySectionProps) =>
{
  const updateProfile = useUpdateProfileMutation()
  const [initial, setInitial] = useState<ProfileDraft>(() =>
    buildProfileDraft(user)
  )
  const lastSyncedRef = useRef<ProfileDraft>(initial)
  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [saving, setSaving] = useState(false)

  const handleFieldId = useId()
  const nameFieldId = useId()
  const pronounsFieldId = useId()
  const locationFieldId = useId()
  const bioFieldId = useId()

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

  return (
    <SetSection
      id="identity"
      eyebrow="Public"
      title="Identity"
      subtitle="Shown on your profile and in @mentions."
    >
      <Field
        label="Username"
        htmlFor={handleFieldId}
        hint={
          <>
            tierlistbuilder.app/
            <span className="mono text-[var(--t-accent)]">
              {draft.handle || 'handle'}
            </span>
          </>
        }
      >
        <TextField
          id={handleFieldId}
          value={draft.handle}
          onChange={(value) =>
            patchDraft({ handle: normalizeHandleInput(value) })
          }
          maxLength={MAX_HANDLE_LENGTH}
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder="handle"
          disabled={saving}
        />
      </Field>

      <Field label="Display name" htmlFor={nameFieldId}>
        <TextField
          id={nameFieldId}
          value={draft.displayName}
          onChange={(value) => patchDraft({ displayName: value })}
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          disabled={saving}
        />
      </Field>

      {/*
        TODO(backend): given/family name split + website field.
        The users table stores a single `displayName` & has no website
        column, so the design's Given/Family/Website inputs are omitted.
        Add the columns to convex/schema.ts + PublicUserMe + updateProfile,
        then restore the design markup:

          <div className="grid grid-cols-2 gap-3">
            <Field label="Given name"><TextField ... /></Field>
            <Field label="Family name"><TextField ... /></Field>
          </div>
          <Field label="Website"><TextField placeholder="fincke.studio" ... /></Field>
      */}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Pronoun" htmlFor={pronounsFieldId}>
          <SelectField
            id={pronounsFieldId}
            value={draft.pronouns}
            onChange={(value) => patchDraft({ pronouns: value })}
            options={PRONOUN_SELECT_OPTIONS}
            disabled={saving}
          />
        </Field>
        <Field label="Location" htmlFor={locationFieldId}>
          <TextField
            id={locationFieldId}
            value={draft.location}
            onChange={(value) => patchDraft({ location: value })}
            maxLength={MAX_LOCATION_LENGTH}
            placeholder="Earth"
            disabled={saving}
          />
        </Field>
      </div>

      <Field
        label="Bio"
        htmlFor={bioFieldId}
        hint={`${draft.bio.length}/${MAX_BIO_LENGTH}`}
      >
        <TextAreaField
          id={bioFieldId}
          value={draft.bio}
          onChange={(value) => patchDraft({ bio: value })}
          maxLength={MAX_BIO_LENGTH}
          rows={2}
          placeholder="Tell people what kinds of lists you make."
          disabled={saving}
        />
      </Field>

      {dirty && (
        <div className="flex items-center gap-2 pt-1">
          <PrimaryButton
            onClick={() =>
            {
              void handleSave()
            }}
            disabled={saving || displayNameInvalid}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </PrimaryButton>
          <SecondaryButton onClick={() => setDraft(initial)} disabled={saving}>
            Reset
          </SecondaryButton>
          {displayNameInvalid && (
            <span className="text-[11px] text-[var(--t-text-faint)]">
              Display name is required
            </span>
          )}
        </div>
      )}
    </SetSection>
  )
}
