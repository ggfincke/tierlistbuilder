// src/features/workspace/settings/ui/AccountTab.tsx
// account tab content — thin wrapper around AccountSection so the tab can grow
// into profile settings w/o pulling UI concerns back into MoreTab

import { AccountSection } from '~/features/platform/auth/ui/AccountSection'

export const AccountTab = () =>
{
  return (
    <>
      <AccountSection />
    </>
  )
}
