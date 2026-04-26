// src/features/marketplace/pages/MarketplaceLayout.tsx
// shared chrome for the marketplace routes — theme sync, top nav, footer,
// toast container, live region, & a single shared SignInModal mount

import { useShallow } from 'zustand/react/shallow'
import { Outlet } from 'react-router-dom'

import { useThemeSync } from '~/app/bootstrap/useThemeSync'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { SignInModal } from '~/features/platform/auth/ui/SignInModal'
import { useSignInPromptStore } from '~/features/marketplace/model/useSignInPromptStore'
import { MarketplaceTopNav } from '~/features/marketplace/components/MarketplaceTopNav'
import { Footer } from '~/features/marketplace/components/Footer'

export const MarketplaceLayout = () =>
{
  useThemeSync()

  const reducedMotion = useSettingsStore((state) => state.reducedMotion)
  const { signInOpen, hideSignIn } = useSignInPromptStore(
    useShallow((s) => ({ signInOpen: s.open, hideSignIn: s.hide }))
  )

  return (
    <main className="relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[420px] overflow-hidden"
      >
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[rgb(var(--t-accent)/0.18)] blur-3xl" />
        <div className="absolute -right-24 top-0 h-[24rem] w-[24rem] rounded-full bg-[rgb(var(--t-accent)/0.1)] blur-3xl" />
      </div>

      <MarketplaceTopNav />
      <Outlet />
      <Footer />

      <SignInModal open={signInOpen} onClose={hideSignIn} />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
