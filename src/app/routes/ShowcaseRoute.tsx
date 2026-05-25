// src/app/routes/ShowcaseRoute.tsx
// /tier-list route — self-only tlotl editor shell

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { ShowcaseEditorPage } from '~/features/platform/showcase/ui/ShowcaseEditorPage'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'

export const ShowcaseRoute = () =>
{
  useThemeSync()
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)

  return (
    <main className="ambient-layer dot-grid-bg relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <ShowcaseEditorPage />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
