// src/app/shells/AppTopNav.tsx
// Scoreboard top bar — BrandPill + (+New, SurfaceNav, Avatar). A 1px
// accent gradient runs across the very top edge as the editorial signature.

import { useState } from 'react'

import { BrandPill } from './topNav/BrandPill'
import { NewBoardAction } from './topNav/NewBoardAction'
import { SurfaceNav } from './topNav/SurfaceNav'
import { TopNavAccountControl } from './topNav/TopNavAccountControl'
import { TopNavModalLayer } from './topNav/TopNavModalLayer'

export const AppTopNav = () =>
{
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  return (
    <>
      <header
        aria-label="Primary navigation"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6 sm:py-5"
      >
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
            <TopNavAccountControl
              onOpenPreferences={() => setPreferencesOpen(true)}
            />
          </div>
        </div>
      </header>
      <TopNavModalLayer
        preferencesOpen={preferencesOpen}
        onClosePreferences={() => setPreferencesOpen(false)}
      />
    </>
  )
}
