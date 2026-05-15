// src/app/shells/topNav/NewBoardAction.tsx
// "+ New board" trigger w/ chevron dropdown — 2 paths (blank vs community).
// Single click opens menu; both blank & template paths require one selection

import { ChevronDown, Plus } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'

import { useStartBlankBoard } from '~/features/workspace/boards/model/useStartBlankBoard'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { Button } from '~/shared/ui/Button'
import { NewBoardMenu } from './NewBoardMenu'

export const NewBoardAction = () =>
{
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const handleStartBlank = useStartBlankBoard()

  const closeMenu = useCallback(() =>
  {
    setMenuOpen(false)
  }, [])

  useDismissibleLayer({
    open: menuOpen,
    layerRef: wrapRef,
    onDismiss: closeMenu,
  })

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="primary"
        tone="accent"
        size="sm"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        aria-label="Create a new board"
        title="Create a new board"
        className="pointer-events-auto whitespace-nowrap"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
        <span className="hidden sm:inline">New board</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${
            menuOpen ? 'rotate-180' : ''
          }`}
          strokeWidth={2.4}
          aria-hidden
        />
      </Button>
      {menuOpen && (
        <NewBoardMenu
          onClose={closeMenu}
          onStartBlank={handleStartBlank}
          menuId={menuId}
        />
      )}
    </div>
  )
}
