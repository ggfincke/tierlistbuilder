// src/features/platform/auth/ui/AccountModal.tsx
// account-management modal — profile (handle, display name, bio, location,
// website, pronouns), read-only email & sign-in method, sign-out-everywhere,
// & delete-account w/ inline confirmation

import { useEffect, useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { LogOut, Trash2 } from 'lucide-react'

import { api } from '@convex/_generated/api'
import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { toast } from '~/shared/notifications/useToastStore'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'

const DISPLAY_NAME_MAX = 64
const HANDLE_MAX = 24
const BIO_MAX = 200
const LOCATION_MAX = 80
const WEBSITE_MAX = 200
const PRONOUNS_MAX = 32
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
  session: Extract<ReturnType<typeof useAuthSession>, { status: 'signed-in' }>
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
  user: Extract<ReturnType<typeof useAuthSession>, { status: 'signed-in' }>['user']
}

interface ProfileDraft
{
  handle: string
  displayName: string
  bio: string
  location: string
  website: string
  pronouns: string
}

const buildDraft = (
  user: ProfileFieldsProps['user']
): ProfileDraft => ({
  handle: user.handle ?? '',
  displayName: user.displayName ?? user.name ?? '',
  bio: user.bio ?? '',
  location: user.location ?? '',
  website: user.website ?? '',
  pronouns: user.pronouns ?? '',
})

const ProfileFields = ({ user }: ProfileFieldsProps) =>
{
  const updateProfile = useMutation(api.users.updateProfile)
  const initial = buildDraft(user)
  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [saving, setSaving] = useState(false)

  const handleId = useId()
  const nameId = useId()
  const bioId = useId()
  const locationId = useId()
  const websiteId = useId()
  const pronounsId = useId()
  const emailId = useId()
  const providerId = useId()

  // resync local state if the server pushes a new value (e.g. another tab
  // edited the same fields). only resync when the user has nothing dirty —
  // mid-edit overwrites would be hostile UX
  useEffect(() =>
  {
    setDraft((current) =>
    {
      const fresh = buildDraft(user)
      const isClean =
        current.handle === initial.handle &&
        current.displayName === initial.displayName &&
        current.bio === initial.bio &&
        current.location === initial.location &&
        current.website === initial.website &&
        current.pronouns === initial.pronouns
      return isClean ? fresh : current
    })
    // initial is recomputed on every render; the user object is the
    // real signal — re-running on user change is what we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // build the diff vs the initial values; keys absent => unchanged
  const diff: Partial<ProfileDraft> = {}
  if (draft.handle.trim().toLowerCase() !== initial.handle.toLowerCase())
  {
    diff.handle = draft.handle
  }
  if (draft.displayName.trim() !== initial.displayName.trim())
  {
    diff.displayName = draft.displayName
  }
  if (draft.bio.trim() !== initial.bio.trim())
  {
    diff.bio = draft.bio
  }
  if (draft.location.trim() !== initial.location.trim())
  {
    diff.location = draft.location
  }
  if (draft.website.trim() !== initial.website.trim())
  {
    diff.website = draft.website
  }
  if (draft.pronouns.trim() !== initial.pronouns.trim())
  {
    diff.pronouns = draft.pronouns
  }
  const dirty = Object.keys(diff).length > 0
  // display name is the only field that cannot be cleared. block save when
  // it would resolve to empty so the server doesn't have to
  const displayNameInvalid = draft.displayName.trim().length === 0

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
        <Field labelId={handleId} label="Handle" hint="Used in your profile URL">
          <div className="flex w-full items-center gap-2 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2.5 py-1.5 focus-within:border-[var(--t-border-hover)]">
            <span className="text-sm text-[var(--t-text-faint)]" aria-hidden>
              @
            </span>
            <input
              id={handleId}
              type="text"
              value={draft.handle}
              maxLength={HANDLE_MAX}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  handle: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, ''),
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
            maxLength={DISPLAY_NAME_MAX}
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
        hint={`${draft.bio.length}/${BIO_MAX}`}
      >
        <TextArea
          id={bioId}
          rows={3}
          className="w-full resize-y"
          value={draft.bio}
          maxLength={BIO_MAX}
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
            maxLength={LOCATION_MAX}
            placeholder="Earth"
            onChange={(e) =>
              setDraft((d) => ({ ...d, location: e.target.value }))
            }
            disabled={saving}
          />
        </Field>
        <Field labelId={websiteId} label="Website">
          <TextInput
            id={websiteId}
            className="w-full"
            type="url"
            inputMode="url"
            value={draft.website}
            maxLength={WEBSITE_MAX}
            placeholder="https://example.com"
            onChange={(e) =>
              setDraft((d) => ({ ...d, website: e.target.value }))
            }
            disabled={saving}
          />
        </Field>
      </div>

      <Field labelId={pronounsId} label="Pronouns">
        <TextInput
          id={pronounsId}
          className="w-full"
          value={draft.pronouns}
          maxLength={PRONOUNS_MAX}
          placeholder="He/him, She/her, They/them, …"
          onChange={(e) =>
            setDraft((d) => ({ ...d, pronouns: e.target.value }))
          }
          disabled={saving}
        />
      </Field>

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
      // sessions are gone server-side; clear local auth state too
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
      // server already nuked auth records; clear local state too so the
      // app routes to its signed-out shell instead of throwing on stale tokens
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
