// src/features/platform/settings/ui/IdentitySection.tsx
// identity profile editor (handle, display name, pronouns, location, bio).
// controlled by the page-level useProfileDraft so the preview shares its state.

import { useId } from 'react'

import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_HANDLE_LENGTH,
  MAX_LOCATION_LENGTH,
  normalizeHandleInput,
  PRONOUN_OPTIONS,
} from '@tierlistbuilder/contracts/platform/user'
import type { ProfileDraftController } from '~/features/platform/auth/model/useProfileDraft'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import {
  Field,
  SelectField,
  SetSection,
  TextAreaField,
  TextField,
} from '~/shared/ui/settings/SettingsChrome'

const PRONOUN_SELECT_OPTIONS = [
  { value: '', label: 'Not specified' },
  ...PRONOUN_OPTIONS.map((option) => ({ value: option, label: option })),
]

interface IdentitySectionProps
{
  profile: ProfileDraftController
}

export const IdentitySection = ({ profile }: IdentitySectionProps) =>
{
  const { draft, patchDraft, dirty, saving, displayNameInvalid, save, reset } =
    profile

  const handleFieldId = useId()
  const nameFieldId = useId()
  const pronounsFieldId = useId()
  const locationFieldId = useId()
  const bioFieldId = useId()

  return (
    <SetSection
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
              void save()
            }}
            disabled={saving || displayNameInvalid}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </PrimaryButton>
          <SecondaryButton onClick={reset} disabled={saving}>
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
