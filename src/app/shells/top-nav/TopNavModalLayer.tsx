// src/app/shells/top-nav/TopNavModalLayer.tsx
// lazy preferences & auth modal slots for global chrome. account settings live
// on the full-page /settings route reached from the avatar dropdown.

import { useCallback } from 'react'

import type { ModalStack } from '~/app/shells/useModalStack'
import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const PreferencesModal = lazyNamed(
  () => import('~/features/platform/preferences/ui/PreferencesModal'),
  'PreferencesModal'
)

const SignInModal = lazyNamed(
  () => import('~/features/platform/auth/ui/SignInModal'),
  'SignInModal'
)

export type TopNavModalPayloads = {
  preferences: undefined
}

export type TopNavModalKey = keyof TopNavModalPayloads

interface TopNavModalLayerProps
{
  modalStack: ModalStack<TopNavModalPayloads>
  signInOpen: boolean
  onCloseSignIn: () => void
}

export const TopNavModalLayer = ({
  modalStack,
  signInOpen,
  onCloseSignIn,
}: TopNavModalLayerProps) =>
{
  const { state: modalState, close: closeModal } = modalStack
  const handleClosePreferences = useCallback(
    () => closeModal('preferences'),
    [closeModal]
  )

  return (
    <>
      <LazyModalSlot when={signInOpen} section="sign in">
        {() => <SignInModal open onClose={onCloseSignIn} />}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.preferences} section="preferences">
        {() => <PreferencesModal open onClose={handleClosePreferences} />}
      </LazyModalSlot>
    </>
  )
}
