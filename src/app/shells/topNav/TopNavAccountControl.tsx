// src/app/shells/topNav/TopNavAccountControl.tsx
// avatar trigger & account menu state for global chrome

import { useCallback, useId, useRef, useState } from 'react'

import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import {
  getDisplayName,
  getUserInitial,
} from '~/features/platform/auth/model/userIdentity'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { logger } from '~/shared/lib/logger'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { TopNavAccountMenu } from './TopNavAccountMenu'
import { TopNavAvatarButton } from './TopNavAvatarButton'
import type { TopNavModalKey } from './TopNavModalLayer'

interface TopNavAccountControlProps
{
  onOpenModal: (key: TopNavModalKey) => void
}

export const TopNavAccountControl = ({
  onOpenModal,
}: TopNavAccountControlProps) =>
{
  const session = useAuthSession()
  const { signOut } = useAuthActions()
  const showSignIn = useSignInPromptStore((state) => state.show)
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

  const accountName =
    session.status === 'signed-in'
      ? getDisplayName(session.user, 'Account', { email: 'local' })
      : null
  const accountLabel = accountName
    ? `Account: ${accountName}`
    : 'Open account menu'

  return (
    <div ref={accountWrapRef} className="relative">
      <TopNavAvatarButton
        label={accountLabel}
        menuOpen={menuOpen}
        menuId={menuId}
        initial={
          session.status === 'signed-in'
            ? getUserInitial(session.user, 'U')
            : undefined
        }
        onToggle={() => setMenuOpen((open) => !open)}
      />
      {menuOpen && (
        <TopNavAccountMenu
          session={session}
          onClose={closeMenu}
          menuId={menuId}
          onOpenAccount={() => onOpenModal('account')}
          onOpenPreferences={() => onOpenModal('preferences')}
          onOpenSignIn={showSignIn}
          onSignOut={() =>
          {
            signOut().catch((error) =>
            {
              logger.error('signOut failed', error)
            })
          }}
        />
      )}
    </div>
  )
}
