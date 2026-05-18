// src/app/shells/topNav/AccountModal.tsx
// app-level account modal composition: platform account controls plus marketplace sections

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { AccountDangerZone } from '~/features/platform/auth/ui/AccountDangerZone'
import { AccountModalShell } from '~/features/platform/auth/ui/AccountModalShell'
import { AccountProfileSection } from '~/features/platform/auth/ui/AccountProfileSection'
import { AccountSessionsSection } from '~/features/platform/auth/ui/AccountSessionsSection'
import { AccountRankingsSection } from '~/features/marketplace/components/account/AccountRankingsSection'
import { AccountTemplatesSection } from '~/features/marketplace/components/account/AccountTemplatesSection'
import { SettingsSection } from '~/shared/ui/SettingsSection'

interface AccountModalProps
{
  open: boolean
  onClose: () => void
}

export const AccountModal = ({ open, onClose }: AccountModalProps) => (
  <AccountModalShell open={open} onClose={onClose}>
    {({ user }) => <SignedInAccountSections onClose={onClose} user={user} />}
  </AccountModalShell>
)

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
