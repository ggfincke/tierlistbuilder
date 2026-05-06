// src/features/platform/auth/ui/AccountModal.tsx
// account-management modal shell for profile, sessions, & delete-account

import { useId } from 'react'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { AccountTemplatesSection } from '~/features/marketplace/components/AccountTemplatesSection'
import { AccountRankingsSection } from '~/features/marketplace/components/AccountRankingsSection'
import { AccountDangerZone } from './AccountDangerZone'
import { AccountProfileSection } from './AccountProfileSection'
import { AccountSessionsSection } from './AccountSessionsSection'

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
          <SignedInAccountSections onClose={onClose} user={session.user} />
        )}
      </div>
    </BaseModal>
  )
}

interface SignedInAccountSectionsProps
{
  onClose: () => void
  user: PublicUserMe
}

const SignedInAccountSections = ({
  onClose,
  user,
}: SignedInAccountSectionsProps) => (
  <>
    <SettingsSection title="Profile">
      <AccountProfileSection user={user} />
    </SettingsSection>

    <SettingsSection title="Your templates">
      <AccountTemplatesSection />
    </SettingsSection>

    <SettingsSection title="Your rankings">
      <AccountRankingsSection />
    </SettingsSection>

    <SettingsSection title="Sessions">
      <AccountSessionsSection onClose={onClose} />
    </SettingsSection>

    <SettingsSection title="Danger zone">
      <AccountDangerZone onClose={onClose} />
    </SettingsSection>
  </>
)
