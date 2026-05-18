// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy account, auth, & preferences modal slots for global chrome

import type { ModalStack } from '~/app/shells/useModalStack'
import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const AccountModal = lazyNamed(
  () => import('~/app/shells/topNav/AccountModal'),
  'AccountModal'
)

const PreferencesModal = lazyNamed(
  () => import('~/features/platform/preferences/ui/PreferencesModal'),
  'PreferencesModal'
)

const SignInModal = lazyNamed(
  () => import('~/features/platform/auth/ui/SignInModal'),
  'SignInModal'
)

export type TopNavModalPayloads = {
  account: undefined
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

  return (
    <>
      <LazyModalSlot when={signInOpen} section="sign in">
        {() => <SignInModal open onClose={onCloseSignIn} />}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.account} section="account">
        {() => <AccountModal open onClose={() => closeModal('account')} />}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.preferences} section="preferences">
        {() => (
          <PreferencesModal open onClose={() => closeModal('preferences')} />
        )}
      </LazyModalSlot>
    </>
  )
}
