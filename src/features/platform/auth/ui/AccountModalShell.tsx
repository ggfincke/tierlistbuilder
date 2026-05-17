// src/features/platform/auth/ui/AccountModalShell.tsx
// account-management modal chrome & signed-in session boundary

import { useId, type ReactNode } from 'react'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

interface AccountModalShellChildrenProps
{
  onClose: () => void
  user: PublicUserMe
}

interface AccountModalShellProps
{
  open: boolean
  onClose: () => void
  children: (props: AccountModalShellChildrenProps) => ReactNode
}

export const AccountModalShell = ({
  children,
  open,
  onClose,
}: AccountModalShellProps) =>
{
  const titleId = useId()
  const session = useAuthSession()

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex h-[min(40rem,calc(100vh-4rem))] w-full max-w-3xl flex-col p-4"
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
            Loading account...
          </p>
        )}
        {session.status === 'signed-out' && (
          <p className="py-1.5 text-sm text-[var(--t-text-faint)]">
            You are signed out.
          </p>
        )}
        {session.status === 'signed-in' && (
          <>{children({ onClose, user: session.user })}</>
        )}
      </div>
    </BaseModal>
  )
}
