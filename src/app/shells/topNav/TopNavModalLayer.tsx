// src/app/shells/topNav/TopNavModalLayer.tsx
// lazy account, auth, & preferences modal slots for global chrome

import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

const AccountModal = lazyNamed(
  () => import('~/features/platform/auth/ui/AccountModal'),
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
