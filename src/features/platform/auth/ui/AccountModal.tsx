// src/features/platform/auth/ui/AccountModal.tsx
// account-management modal for profile, sessions, & delete-account

import { useEffect, useId, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { LogOut, Trash2 } from 'lucide-react'

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
import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { getDisplayName } from '~/features/platform/auth/model/userIdentity'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { toast } from '~/shared/notifications/useToastStore'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'

const DELETE_CONFIRM_PHRASE = 'delete'

interface AccountModalProps
{
  open: boolean
  onClose: () => void
}

export const AccountModal = ({ open, onClose }: AccountModalProps) =>
{
  const titleId = useId()
  const session = useAuthSession()

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex h-[min(36rem,calc(100vh-4rem))] w-full max-w-2xl flex-col p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <ModalHeader titleId={titleId}>Account</ModalHeader>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {session.status === 'loading' && (
          <p className="py-1.5 text-sm text-[var(--t-text-faint)]">
            Loading account…
          </p>
        )}
        {session.status === 'signed-out' && (
          <p className="py-1.5 text-sm text-[var(--t-text-faint)]">
            You are signed out.
          </p>
        )}
        {session.status === 'signed-in' && (
          <SignedInBody onClose={onClose} session={session} />
        )}
      </div>
    </BaseModal>
  )
}

interface SignedInBodyProps
{
  onClose: () => void
  session: { status: 'signed-in'; user: PublicUserMe }
}

const SignedInBody = ({ onClose, session }: SignedInBodyProps) =>
{
  const { user } = session

  return (
    <>
      <SettingsSection title="Profile">
        <ProfileFields user={user} />
      </SettingsSection>

      <SettingsSection title="Sessions">
        <SessionsActions onClose={onClose} />
      </SettingsSection>

      <SettingsSection title="Danger zone">
        <DeleteAccountAction onClose={onClose} />
      </SettingsSection>
    </>
  )
}

interface ProfileFieldsProps
{
  user: PublicUserMe
}

interface ProfileDraft
{
  handle: string
  displayName: string
  bio: string
  location: string
  pronouns: string
}

const buildDraft = (user: PublicUserMe): ProfileDraft => ({
  handle: user.handle ?? '',
  displayName: getDisplayName(user, '', { email: 'omit' }),
  bio: user.bio ?? '',
  location: user.location ?? '',
  pronouns: user.pronouns ?? '',
})

const PROFILE_DRAFT_FIELDS = [
  'handle',
  'displayName',
  'bio',
  'location',
  'pronouns',
] as const

const trimmed = (raw: string): string => raw.trim()

// per-field canonicalizer used both for save-payload diffing and for comparing
// server state against the draft. handle normalizes lowercase + charset; the
// rest just trim
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

const draftsEqual = (left: ProfileDraft, right: ProfileDraft): boolean =>
  PROFILE_DRAFT_FIELDS.every((field) => left[field] === right[field])

const mergeCleanFields = (
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

const ProfileFields = ({ user }: ProfileFieldsProps) =>
{
  const updateProfile = useMutation(api.users.updateProfile)
  const [initial, setInitial] = useState<ProfileDraft>(() => buildDraft(user))
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
    const fresh = buildDraft(user)
    setInitial((current) => (draftsEqual(current, fresh) ? current : fresh))
    setDraft((current) =>
    {
      const next = mergeCleanFields(current, fresh, lastSyncedRef.current)
      return draftsEqual(current, next) ? current : next
    })
    lastSyncedRef.current = fresh
  }, [user])

  const diff: Partial<ProfileDraft> = {}
  for (const field of PROFILE_DRAFT_FIELDS)
  {
    const normalize = PROFILE_FIELD_NORMALIZERS[field]
    const next = normalize(draft[field])
    if (next !== normalize(initial[field]))
    {
      diff[field] = next
    }
  }
  const dirty = Object.keys(diff).length > 0
  const displayNameInvalid = trimmed(draft.displayName).length === 0

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
      toast(
        error instanceof Error ? error.message : 'Failed to update profile',
        'error'
      )
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
        <Field
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
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  handle: normalizeHandleInput(e.target.value),
                }))
              }
              disabled={saving}
              placeholder="yourhandle"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-faint)]"
            />
          </div>
        </Field>

        <Field labelId={nameId} label="Display name">
          <TextInput
            id={nameId}
            className="w-full"
            value={draft.displayName}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            onChange={(e) =>
              setDraft((d) => ({ ...d, displayName: e.target.value }))
            }
            disabled={saving}
          />
        </Field>
      </div>

      <Field
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
          onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
          disabled={saving}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field labelId={locationId} label="Location">
          <TextInput
            id={locationId}
            className="w-full"
            value={draft.location}
            maxLength={MAX_LOCATION_LENGTH}
            placeholder="Earth"
            onChange={(e) =>
              setDraft((d) => ({ ...d, location: e.target.value }))
            }
            disabled={saving}
          />
        </Field>
        <Field labelId={pronounsId} label="Pronouns">
          <select
            id={pronounsId}
            value={draft.pronouns}
            disabled={saving}
            onChange={(e) =>
              setDraft((d) => ({ ...d, pronouns: e.target.value }))
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
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field labelId={emailId} label="Email">
          <p
            id={emailId}
            className="select-text truncate rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2.5 py-1.5 text-sm text-[var(--t-text-secondary)]"
          >
            {user.email ?? 'No email on file'}
          </p>
        </Field>

        <Field labelId={providerId} label="Sign-in method">
          <p
            id={providerId}
            className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2.5 py-1.5 text-sm text-[var(--t-text-secondary)]"
          >
            Email &amp; password
          </p>
        </Field>
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
            {saving ? 'Saving…' : 'Save changes'}
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

const SessionsActions = ({ onClose }: { onClose: () => void }) =>
{
  const signOutEverywhere = useMutation(api.users.signOutEverywhere)
  const { signOut } = useAuthActions()
  const [pending, setPending] = useState(false)

  const handleClick = async () =>
  {
    if (pending) return
    setPending(true)
    try
    {
      await signOutEverywhere({})
      await signOut()
      toast('Signed out from every device', 'success')
      onClose()
    }
    catch (error)
    {
      toast(
        error instanceof Error
          ? error.message
          : 'Failed to sign out everywhere',
        'error'
      )
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--t-text-muted)]">
        Sign out from every device, including this one.
      </p>
      <SecondaryButton
        variant="surface"
        tone="destructive"
        disabled={pending}
        onClick={handleClick}
      >
        <LogOut className="h-3.5 w-3.5" />
        {pending ? 'Signing out…' : 'Sign out everywhere'}
      </SecondaryButton>
    </div>
  )
}

const DeleteAccountAction = ({ onClose }: { onClose: () => void }) =>
{
  const deleteAccount = useMutation(api.users.deleteAccount)
  const { signOut } = useAuthActions()
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [pending, setPending] = useState(false)
  const confirmInputId = useId()

  const canConfirm =
    confirmText.trim().toLowerCase() === DELETE_CONFIRM_PHRASE && !pending

  const handleDelete = async () =>
  {
    if (!canConfirm) return
    setPending(true)
    try
    {
      await deleteAccount({})
      await signOut()
      toast('Account deleted', 'success')
      onClose()
    }
    catch (error)
    {
      toast(
        error instanceof Error ? error.message : 'Failed to delete account',
        'error'
      )
      setPending(false)
    }
  }

  if (!confirming)
  {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--t-text-muted)]">
          Permanently delete your account, boards, templates, and uploads. This
          cannot be undone.
        </p>
        <SecondaryButton
          variant="surface"
          tone="destructive"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete account
        </SecondaryButton>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--t-text-muted)]">
        Type{' '}
        <span className="font-mono font-semibold text-[var(--t-text)]">
          {DELETE_CONFIRM_PHRASE}
        </span>{' '}
        to confirm. This will sign you out and remove all your data.
      </p>
      <TextInput
        id={confirmInputId}
        autoFocus
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={DELETE_CONFIRM_PHRASE}
        disabled={pending}
        aria-label="Type 'delete' to confirm"
      />
      <div className="flex items-center gap-2">
        <PrimaryButton
          tone="destructive"
          disabled={!canConfirm}
          onClick={() =>
          {
            void handleDelete()
          }}
        >
          {pending ? 'Deleting…' : 'Delete forever'}
        </PrimaryButton>
        <SecondaryButton
          onClick={() =>
          {
            setConfirming(false)
            setConfirmText('')
          }}
          disabled={pending}
        >
          Cancel
        </SecondaryButton>
      </div>
    </div>
  )
}

const Field = ({
  labelId,
  label,
  hint,
  children,
}: {
  labelId: string
  label: string
  hint?: string
  children: React.ReactNode
}) => (
  <div className="space-y-1">
    <div className="flex items-baseline justify-between">
      <label
        htmlFor={labelId}
        className="block text-xs font-medium text-[var(--t-text-muted)]"
      >
        {label}
      </label>
      {hint && (
        <span className="text-[10px] text-[var(--t-text-faint)]">{hint}</span>
      )}
    </div>
    {children}
  </div>
)
