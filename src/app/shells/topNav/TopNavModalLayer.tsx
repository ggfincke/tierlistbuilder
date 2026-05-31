// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy preferences modal slot for global chrome

import { useCallback } from 'react'

import type { ModalStack } from '~/app/shells/useModalStack'
import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const PreferencesModal = lazyNamed(
  () => import('~/features/platform/preferences/ui/PreferencesModal'),
  'PreferencesModal'
)

export type TopNavModalPayloads = {
  preferences: undefined
}

export type TopNavModalKey = keyof TopNavModalPayloads

interface TopNavModalLayerProps
{
  modalStack: ModalStack<TopNavModalPayloads>
}

export const TopNavModalLayer = ({ modalStack }: TopNavModalLayerProps) =>
{
  const { state: modalState, close: closeModal } = modalStack
  const handleClosePreferences = useCallback(
    () => closeModal('preferences'),
    [closeModal]
  )

  return (
    <>
      <LazyModalSlot when={modalState.preferences} section="preferences">
        {() => <PreferencesModal open onClose={handleClosePreferences} />}
      </LazyModalSlot>
    </>
  )
}
