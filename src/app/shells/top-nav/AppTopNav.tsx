// src/app/shells/top-nav/AppTopNav.tsx
// * scoreboard top bar, route pills, new-board action, & account menu
// top-edge accent stays here as route chrome signature

import { useEffect, useState } from 'react'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { useModalStack } from '~/app/shells/useModalStack'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { BrandPill } from './BrandPill'
import { NewBoardAction } from './NewBoardAction'
import { SurfaceNav } from './SurfaceNav'
import { TopNavAccountControl } from './TopNavAccountControl'
import { TopNavModalLayer, type TopNavModalPayloads } from './TopNavModalLayer'

export const AppTopNav = () =>
{
  const signInOpen = useSignInPromptStore((state) => state.open)
  const closeSignIn = useSignInPromptStore((state) => state.hide)
  const modalStack = useModalStack<TopNavModalPayloads>()
  const { open: openModal } = modalStack
  const topNavLocked = usePreferencesStore((state) => state.topNavLocked)

  // Hide while scrolling unless locked always-visible. Capture phase catches
  // scrolls from nested scroll containers because scroll events don't bubble.
  const [isScrolling, setIsScrolling] = useState(false)
  useEffect(() =>
  {
    if (topNavLocked) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    const onScroll = () =>
    {
      setIsScrolling(true)
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => setIsScrolling(false), 200)
    }
    window.addEventListener('scroll', onScroll, {
      passive: true,
      capture: true,
    })
    return () =>
    {
      window.removeEventListener('scroll', onScroll, { capture: true })
      if (timeout) clearTimeout(timeout)
    }
  }, [topNavLocked])

  // Cmd+, / Ctrl+, opens Preferences; skip editable fields.
  useEffect(() =>
  {
    const onKeyDown = (event: KeyboardEvent) =>
    {
      if (event.key !== ',' || !(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      )
      {
        return
      }
      event.preventDefault()
      openModal('preferences')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openModal])

  const slideClasses = topNavLocked
    ? 'translate-y-0'
    : isScrolling
      ? '-translate-y-full delay-0'
      : '-translate-y-full delay-700 group-hover:translate-y-0 group-hover:delay-0 group-focus-within:translate-y-0 group-focus-within:delay-0'

  return (
    <>
      <header
        aria-label="Primary navigation"
        className="group pointer-events-none fixed inset-x-0 top-0 z-30"
      >
        {!topNavLocked && (
          <span
            aria-hidden
            className="pointer-events-auto absolute inset-x-0 top-0 h-20"
          />
        )}
        <div
          className={`relative px-4 py-4 transition-transform duration-300 ease-out sm:px-6 sm:py-5 ${slideClasses}`}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 border-b border-[var(--t-border)] bg-[var(--t-bg-page)]/80 backdrop-blur-md"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, var(--t-accent) 30%, var(--t-accent-2) 70%, transparent 100%)',
              opacity: 0.7,
            }}
          />
          <div className="relative flex w-full items-center justify-between gap-3">
            <BrandPill />
            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
              <NewBoardAction />
              <SurfaceNav />
              <TopNavAccountControl onOpenModal={openModal} />
            </div>
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
