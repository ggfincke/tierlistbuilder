// src/app/shells/AppTopNav.tsx
// fixed global app chrome for brand, surface nav, account menu, & modals

import { useState } from 'react'

import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { BrandCapsule } from './topNav/BrandCapsule'
import { SurfaceNav } from './topNav/SurfaceNav'
import { TopNavAccountControl } from './topNav/TopNavAccountControl'
import { TopNavModalLayer } from './topNav/TopNavModalLayer'

export const AppTopNav = () =>
{
  const showSignIn = useSignInPromptStore((s) => s.show)
  const signInOpen = useSignInPromptStore((s) => s.open)
  const hideSignIn = useSignInPromptStore((s) => s.hide)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  return (
    <>
      <header
        aria-label="Primary navigation"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5"
      >
        <BrandCapsule />

        <SurfaceNav>
          <TopNavAccountControl
            onSignIn={showSignIn}
            onOpenAccount={() => setAccountOpen(true)}
            onOpenPreferences={() => setPreferencesOpen(true)}
          />
        </SurfaceNav>
      </header>
      <TopNavModalLayer
        signInOpen={signInOpen}
        accountOpen={accountOpen}
        preferencesOpen={preferencesOpen}
        onCloseSignIn={hideSignIn}
        onCloseAccount={() => setAccountOpen(false)}
        onClosePreferences={() => setPreferencesOpen(false)}
      />
    </>
  )
}
