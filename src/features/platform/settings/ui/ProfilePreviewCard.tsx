// src/features/platform/settings/ui/ProfilePreviewCard.tsx
// live "how others see you" preview + avatar upload — renders the profile card
// & marketplace byline from the Identity draft, updating as fields are edited

import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import type { ProfileDraft } from '~/features/platform/auth/model/accountProfileDraft'
import {
  AVATAR_FILE_ACCEPT,
  uploadAvatarFile,
} from '~/features/platform/auth/model/avatarUpload'
import {
  useRemoveAvatarMutation,
  useSetAvatarAction,
} from '~/features/platform/auth/model/useAccountMutations'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import { Avatar } from '~/shared/ui/Avatar'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { SegmentedControl } from '~/shared/ui/settings/SegmentedControl'
import { SetSection } from '~/shared/ui/settings/SettingsChrome'

type PreviewContext = 'profile' | 'byline'

const PREVIEW_OPTIONS = [
  { value: 'profile' as const, label: 'Profile' },
  { value: 'byline' as const, label: 'Card byline' },
]

// clickable avatar w/ camera overlay — the upload affordance inside the preview
const AvatarUploadButton = ({
  name,
  src,
  pending,
  onPick,
}: {
  name: string
  src: string | null
  pending: boolean
  onPick: () => void
}) => (
  <button
    type="button"
    aria-label="Upload avatar"
    disabled={pending}
    onClick={onPick}
    className="focus-custom relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-sunken)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-70"
  >
    <Avatar name={name} src={src} size="xl" variant="gradient" />
    <span className="absolute inset-x-0 bottom-0 grid h-5 place-items-center bg-black/55 text-white">
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Camera className="h-3 w-3" />
      )}
    </span>
  </button>
)

interface ProfilePreviewCardProps
{
  user: PublicUserMe
  draft: ProfileDraft
}

export const ProfilePreviewCard = ({
  user,
  draft,
}: ProfilePreviewCardProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const setAvatar = useSetAvatarAction()
  const removeAvatar = useRemoveAvatarMutation()
  const [pending, setPending] = useState(false)
  const [context, setContext] = useState<PreviewContext>('profile')

  const handlePick = () =>
  {
    if (!pending) inputRef.current?.click()
  }

  const handleFile = async (file: File | null) =>
  {
    if (!file || pending) return
    setPending(true)
    try
    {
      const upload = await uploadAvatarFile(file)
      await setAvatar(upload)
      toast('Avatar updated', 'success')
    }
    catch (error)
    {
      toast(formatError(error, 'Failed to update avatar'), 'error')
    }
    finally
    {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () =>
  {
    if (pending) return
    setPending(true)
    try
    {
      await removeAvatar()
      toast('Avatar removed', 'success')
    }
    catch (error)
    {
      toast(formatError(error, 'Failed to remove avatar'), 'error')
    }
    finally
    {
      setPending(false)
    }
  }

  const name = draft.displayName.trim() || 'Your name'
  const handle = draft.handle || 'handle'
  const meta = [draft.pronouns, draft.location].filter(Boolean).join(' · ')
  const bio = draft.bio.trim()

  return (
    <SetSection eyebrow="Preview" title="How others see you">
      <SegmentedControl<PreviewContext>
        options={PREVIEW_OPTIONS}
        value={context}
        onChange={setContext}
        ariaLabel="Preview context"
      />

      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_FILE_ACCEPT}
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />

      {context === 'profile' ? (
        <div className="flex flex-col items-center gap-2.5 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-4 py-5 text-center">
          <AvatarUploadButton
            name={name}
            src={user.image}
            pending={pending}
            onPick={handlePick}
          />
          <div>
            <p className="text-[16px] font-black leading-tight text-[var(--t-text)]">
              {name}
            </p>
            <p className="mono mt-0.5 text-[12px] text-[var(--t-accent)]">
              @{handle}
            </p>
          </div>
          {meta && (
            <p className="text-[11px] text-[var(--t-text-muted)]">{meta}</p>
          )}
          {bio && (
            <p className="max-w-[34ch] text-[12px] leading-relaxed text-[var(--t-text-secondary)]">
              {bio}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-3">
          <Avatar name={name} src={user.image} size="sm" variant="gradient" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--t-text)]">
              {name}
            </p>
            <p className="mono truncate text-[11px] text-[var(--t-text-muted)]">
              @{handle}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton size="sm" disabled={pending} onClick={handlePick}>
          <Camera className="h-3.5 w-3.5" />
          {pending ? 'Uploading...' : 'Upload'}
        </SecondaryButton>
        {user.hasAvatar && (
          <SecondaryButton
            size="sm"
            tone="destructive"
            disabled={pending}
            onClick={handleRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </SecondaryButton>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-[var(--t-text-faint)]">
        Square image, PNG or JPG. Shown on your profile &amp; marketplace cards.
      </p>
    </SetSection>
  )
}
