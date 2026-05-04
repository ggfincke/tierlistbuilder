// src/app/shells/AppTopNav.tsx
// fixed global app chrome for brand, surface nav, account, & modals

import { useCallback, useState } from 'react'

import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { BrandCapsule } from './topNav/BrandCapsule'
import { SurfaceNav } from './topNav/SurfaceNav'
import { TopNavAccountControl } from './topNav/TopNavAccountControl'
import {
  TopNavModalLayer,
  type TopNavModalKey,
} from './topNav/TopNavModalLayer'

export const AppTopNav = () =>
{
  const signInOpen = useSignInPromptStore((state) => state.open)
  const closeSignIn = useSignInPromptStore((state) => state.hide)
  const [openModal, setOpenModal] = useState<TopNavModalKey | null>(null)
  const closeModal = useCallback(() => setOpenModal(null), [])

  return (
    <>
      <header
        aria-label="Primary navigation"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5"
      >
        <BrandCapsule />

        <SurfaceNav>
          <TopNavAccountControl onOpenModal={setOpenModal} />
        </SurfaceNav>
      </header>
      <TopNavModalLayer
        open={openModal}
        signInOpen={signInOpen}
        onClose={closeModal}
        onCloseSignIn={closeSignIn}
      />
    </>
  )
}
