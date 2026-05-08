// src/features/platform/auth/ui/AccountDangerZone.tsx
// destructive account deletion confirmation flow

import { useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { Trash2 } from 'lucide-react'

import { api } from '@convex/_generated/api'
import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

const DELETE_CONFIRM_PHRASE = 'delete'

interface AccountDangerZoneProps
{
  onClose: () => void
}

export const AccountDangerZone = ({ onClose }: AccountDangerZoneProps) =>
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
      toast(formatError(error, 'Failed to delete account'), 'error')
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
        onChange={(event) => setConfirmText(event.target.value)}
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
          {pending ? 'Deleting...' : 'Delete forever'}
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
