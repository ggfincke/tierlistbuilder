// src/app/shells/topNav/TopNavAccountControl.tsx
// avatar trigger, account menu state, & auth actions for global chrome

import { useCallback, useId, useRef, useState } from 'react'

import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import {
  getDisplayName,
  getUserInitial,
} from '~/features/platform/auth/model/userIdentity'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { TopNavAccountMenu } from './TopNavAccountMenu'
import { TopNavAvatarButton } from './TopNavAvatarButton'

interface TopNavAccountControlProps
{
  onSignIn: () => void
  onOpenAccount: () => void
  onOpenPreferences: () => void
}

export const TopNavAccountControl = ({
  onSignIn,
  onOpenAccount,
  onOpenPreferences,
}: TopNavAccountControlProps) =>
{
  const session = useAuthSession()
  const { signOut } = useAuthActions()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const accountWrapRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() =>
  {
    setMenuOpen(false)
  }, [])

  useDismissibleLayer({
    open: menuOpen,
    layerRef: accountWrapRef,
    onDismiss: closeMenu,
  })

  const signedInLabel =
    session.status === 'signed-in'
      ? getDisplayName(session.user, 'Signed in', { email: 'omit' })
      : null
  const signedInEmail =
    session.status === 'signed-in' ? (session.user.email ?? null) : null
  const initial =
    session.status === 'signed-in' ? getUserInitial(session.user) : null
  const isSignedIn = session.status === 'signed-in'
  const isLoading = session.status === 'loading'

  const handleSignOut = useCallback(() =>
  {
    void signOut()
  }, [signOut])

  return (
    <div ref={accountWrapRef} className="relative">
      <TopNavAvatarButton
        initial={initial}
        imageUrl={isSignedIn ? (session.user.image ?? null) : null}
        label={
          isSignedIn
            ? `Account: ${signedInLabel ?? 'signed in'}`
            : 'Open account menu'
        }
        menuOpen={menuOpen}
        menuId={menuId}
        onToggle={() => setMenuOpen((open) => !open)}
        loading={isLoading}
      />
      {menuOpen && (
        <TopNavAccountMenu
          onClose={closeMenu}
          menuId={menuId}
          signedIn={isSignedIn}
          signedInLabel={signedInLabel}
          signedInEmail={signedInEmail}
          onSignIn={onSignIn}
          onSignOut={handleSignOut}
          onOpenAccount={onOpenAccount}
          onOpenPreferences={onOpenPreferences}
        />
      )}
    </div>
  )
}
