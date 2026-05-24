// src/features/platform/settings/ui/AvatarSection.tsx
// avatar upload/remove controls for the account settings page

import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  AVATAR_FILE_ACCEPT,
  uploadAvatarFile,
} from '~/features/platform/auth/model/avatarUpload'
import {
  useRemoveAvatarMutation,
  useSetAvatarAction,
} from '~/features/platform/auth/model/useAccountMutations'
import { getDisplayName } from '~/features/platform/auth/model/userIdentity'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import { Avatar } from '~/shared/ui/Avatar'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { SetSection } from './SettingsChrome'

interface AvatarSectionProps
{
  user: PublicUserMe
}

export const AvatarSection = ({ user }: AvatarSectionProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const setAvatar = useSetAvatarAction()
  const removeAvatar = useRemoveAvatarMutation()
  const [pending, setPending] = useState(false)

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

  return (
    <SetSection eyebrow="Image" title="Avatar">
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_FILE_ACCEPT}
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Upload avatar"
          disabled={pending}
          onClick={handlePick}
          className="focus-custom relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-sunken)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Avatar
            name={getDisplayName(user, 'You')}
            src={user.image}
            size="xl"
            variant="gradient"
          />
          <span className="absolute inset-x-0 bottom-0 grid h-5 place-items-center bg-black/55 text-white">
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[11px] leading-relaxed text-[var(--t-text-muted)]">
            Upload a square avatar for profile and marketplace attribution.
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              type="button"
              size="sm"
              variant="surface"
              disabled={pending}
              onClick={handlePick}
            >
              <Camera className="h-3.5 w-3.5" />
              {pending ? 'Uploading...' : 'Upload'}
            </SecondaryButton>
            {user.hasAvatar && (
              <SecondaryButton
                type="button"
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
        </div>
      </div>
    </SetSection>
  )
}
