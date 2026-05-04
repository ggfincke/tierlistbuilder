// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy preferences modal slot for global chrome

import { lazy } from 'react'

import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const PreferencesModal = lazy(() =>
  import('~/features/platform/preferences/ui/PreferencesModal').then(
    (module) => ({
      default: module.PreferencesModal,
    })
  )
)

interface TopNavModalLayerProps
{
  preferencesOpen: boolean
  onClosePreferences: () => void
}

export const TopNavModalLayer = ({
  preferencesOpen,
  onClosePreferences,
}: TopNavModalLayerProps) => (
  <>
    <LazyModalSlot when={preferencesOpen} section="preferences">
      {() => <PreferencesModal open onClose={onClosePreferences} />}
    </LazyModalSlot>
  </>
)
