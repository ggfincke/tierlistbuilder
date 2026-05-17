// src/app/shells/AppTopNav.tsx
// Scoreboard top bar — BrandPill ... (+New, SurfaceNav, Avatar). A 1px
// accent gradient runs across the very top edge as the editorial signature.

import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { useModalStack } from '~/app/shells/useModalStack'
import { BrandPill } from './topNav/BrandPill'
import { NewBoardAction } from './topNav/NewBoardAction'
import { SurfaceNav } from './topNav/SurfaceNav'
import { TopNavAccountControl } from './topNav/TopNavAccountControl'
import {
  TopNavModalLayer,
  type TopNavModalPayloads,
} from './topNav/TopNavModalLayer'

export const AppTopNav = () =>
{
  const signInOpen = useSignInPromptStore((state) => state.open)
  const closeSignIn = useSignInPromptStore((state) => state.hide)
  const modalStack = useModalStack<TopNavModalPayloads>()
  const { open: openModal } = modalStack

  return (
    <>
      <header
        aria-label="Primary navigation"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6 sm:py-5"
      >
        {/* 1px accent gradient — the Scoreboard "live" signature across the
            very top edge of the viewport. accent -> accent-2 -> transparent. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, var(--t-accent) 30%, var(--t-accent-2) 70%, transparent 100%)',
            opacity: 0.7,
          }}
        />
        <div className="flex w-full items-center justify-between gap-3">
          <BrandPill />
          <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
            <NewBoardAction />
            <SurfaceNav />
            <TopNavAccountControl onOpenModal={openModal} />
          </div>
        </div>
      </header>
      <TopNavModalLayer
        modalStack={modalStack}
        signInOpen={signInOpen}
        onCloseSignIn={closeSignIn}
      />
    </>
  )
}
