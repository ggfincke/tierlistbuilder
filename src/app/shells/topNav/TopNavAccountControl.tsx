// src/app/shells/topNav/TopNavAccountControl.tsx
// avatar trigger & preferences menu state for global chrome

import { useCallback, useId, useRef, useState } from 'react'

import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { TopNavAccountMenu } from './TopNavAccountMenu'
import { TopNavAvatarButton } from './TopNavAvatarButton'

interface TopNavAccountControlProps
{
  onOpenPreferences: () => void
}

export const TopNavAccountControl = ({
  onOpenPreferences,
}: TopNavAccountControlProps) =>
{
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

  return (
    <div ref={accountWrapRef} className="relative">
      <TopNavAvatarButton
        label="Open app menu"
        menuOpen={menuOpen}
        menuId={menuId}
        onToggle={() => setMenuOpen((open) => !open)}
      />
      {menuOpen && (
        <TopNavAccountMenu
          onClose={closeMenu}
          menuId={menuId}
          onOpenPreferences={onOpenPreferences}
        />
      )}
    </div>
  )
}
