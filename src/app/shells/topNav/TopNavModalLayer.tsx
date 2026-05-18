// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy preferences modal slot for global chrome

import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const PreferencesModal = lazyNamed(
  () => import('~/features/platform/preferences/ui/PreferencesModal'),
  'PreferencesModal'
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
