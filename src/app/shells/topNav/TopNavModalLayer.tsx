// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy sign-in, account, & preferences modal slots for global chrome

import { lazy } from 'react'

import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const SignInModal = lazy(() =>
  import('~/features/platform/auth/ui/SignInModal').then((module) => ({
    default: module.SignInModal,
  }))
)

const AccountModal = lazy(() =>
  import('~/features/platform/auth/ui/AccountModal').then((module) => ({
    default: module.AccountModal,
  }))
)

const PreferencesModal = lazy(() =>
  import('~/features/platform/preferences/ui/PreferencesModal').then(
    (module) => ({
      default: module.PreferencesModal,
    })
  )
)

interface TopNavModalLayerProps
{
  signInOpen: boolean
  accountOpen: boolean
  preferencesOpen: boolean
  onCloseSignIn: () => void
  onCloseAccount: () => void
  onClosePreferences: () => void
}

export const TopNavModalLayer = ({
  signInOpen,
  accountOpen,
  preferencesOpen,
  onCloseSignIn,
  onCloseAccount,
  onClosePreferences,
}: TopNavModalLayerProps) => (
  <>
    <LazyModalSlot when={signInOpen} section="sign in">
      {() => <SignInModal open onClose={onCloseSignIn} />}
    </LazyModalSlot>
    <LazyModalSlot when={preferencesOpen} section="preferences">
      {() => <PreferencesModal open onClose={onClosePreferences} />}
    </LazyModalSlot>
    <LazyModalSlot when={accountOpen} section="account">
      {() => <AccountModal open onClose={onCloseAccount} />}
    </LazyModalSlot>
  </>
)
