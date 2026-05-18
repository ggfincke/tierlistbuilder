// src/features/platform/auth/ui/AccountSessionsSection.tsx
// sign-out-everywhere account action

import { useState } from 'react'
import { LogOut } from 'lucide-react'

import { useSignOutEverywhereMutation } from '~/features/platform/auth/model/useAccountMutations'
import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

interface AccountSessionsSectionProps
{
  onClose: () => void
}

export const AccountSessionsSection = ({
  onClose,
}: AccountSessionsSectionProps) =>
{
  const signOutEverywhere = useSignOutEverywhereMutation()
  const { signOut } = useAuthActions()
  const [pending, setPending] = useState(false)

  const handleClick = async () =>
  {
    if (pending) return
    setPending(true)
    try
    {
      await signOutEverywhere()
      await signOut()
      toast('Signed out from every device', 'success')
      onClose()
    }
    catch (error)
    {
      toast(formatError(error, 'Failed to sign out everywhere'), 'error')
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
        {pending ? 'Signing out...' : 'Sign out everywhere'}
      </SecondaryButton>
    </div>
  )
}
