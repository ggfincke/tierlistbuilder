// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy account, auth, & preferences modal slots for global chrome

import { lazy } from 'react'

import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

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

const SignInModal = lazy(() =>
  import('~/features/platform/auth/ui/SignInModal').then((module) => ({
    default: module.SignInModal,
  }))
)

export type TopNavModalKey = 'account' | 'preferences'

interface TopNavModalLayerProps
{
  open: TopNavModalKey | null
  signInOpen: boolean
  onClose: () => void
  onCloseSignIn: () => void
}

export const TopNavModalLayer = ({
  open,
  signInOpen,
  onClose,
  onCloseSignIn,
}: TopNavModalLayerProps) => (
  <>
    <LazyModalSlot when={signInOpen} section="sign in">
      {() => <SignInModal open onClose={onCloseSignIn} />}
    </LazyModalSlot>
    <LazyModalSlot when={open === 'account'} section="account">
      {() => <AccountModal open onClose={onClose} />}
    </LazyModalSlot>
    <LazyModalSlot when={open === 'preferences'} section="preferences">
      {() => <PreferencesModal open onClose={onClose} />}
    </LazyModalSlot>
  </>
)
