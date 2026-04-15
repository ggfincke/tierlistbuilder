// src/features/workspace/settings/ui/AccountTab.tsx
// account tab content — thin wrapper around the auth slice's AccountSection
// so the tab can grow into profile settings (display name, avatar, delete
// account) w/o pulling ui concerns back into MoreTab

import { AccountSection } from '@/features/platform/auth/ui/AccountSection'

export const AccountTab = () =>
{
  return (
    <>
      <AccountSection />
    </>
  )
}
