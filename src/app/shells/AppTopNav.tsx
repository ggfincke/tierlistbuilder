// src/app/shells/AppTopNav.tsx
// fixed global app chrome for brand, surface nav, preferences, & modals

import { useState } from 'react'

import { BrandCapsule } from './topNav/BrandCapsule'
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
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5"
      >
        <BrandCapsule />

        <SurfaceNav>
          <TopNavAccountControl
            onOpenPreferences={() => setPreferencesOpen(true)}
          />
        </SurfaceNav>
      </header>
      <TopNavModalLayer
        preferencesOpen={preferencesOpen}
        onClosePreferences={() => setPreferencesOpen(false)}
      />
    </>
  )
}
