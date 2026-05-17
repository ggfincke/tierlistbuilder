// src/features/library/components/cards/BoardCardMenu.tsx
// per-row overflow menu for library boards. lifts the destructive action out
// of the card's open trigger so we can render a real button without nesting

import { useCallback, useId, useRef, useState } from 'react'
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'

interface BoardCardMenuProps
{
  board: LibraryBoardListItem
  onRequestDelete: (board: LibraryBoardListItem) => void
  onRequestRename?: (board: LibraryBoardListItem) => void
  onDuplicate?: (board: LibraryBoardListItem) => void
  disabled?: boolean
  // surface to render the kebab on. 'overlay' uses a translucent dark dot
  // suited for sitting over cover art; 'inline' uses the regular text color
  variant?: 'overlay' | 'inline'
}

const TRIGGER_BASE =
  'focus-custom inline-flex h-8 w-8 items-center justify-center rounded-md transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:pointer-events-none disabled:opacity-40'

const TRIGGER_BY_VARIANT: Record<
  NonNullable<BoardCardMenuProps['variant']>,
  string
> = {
  // overlay sits on cover art — keep it solid enough to survive bright mosaic
  // tiles & gradient hover scrims; the hairline ring keeps the edge crisp
  // against dark covers where pure-black backdrops would blend in
  overlay:
    'bg-black/85 text-white shadow-sm ring-1 ring-white/20 backdrop-blur-sm hover:bg-black hover:ring-white/35 focus-visible:bg-black',
  inline:
    'text-[var(--t-text-dim)] hover:bg-[rgb(var(--t-overlay)/0.06)] hover:text-[var(--t-text)]',
}

export const BoardCardMenu = ({
  board,
  onRequestDelete,
  onRequestRename,
  onDuplicate,
  disabled = false,
  variant = 'overlay',
}: BoardCardMenuProps) =>
{
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const handleDismiss = useCallback(() =>
  {
    setOpen(false)
  }, [])

  useDismissibleLayer({
    open,
    triggerRef,
    layerRef: menuRef,
    onDismiss: handleDismiss,
  })

  const handleTriggerClick = (): void =>
  {
    if (disabled) return
    setOpen((current) => !current)
  }

  const closeAndRun = (action: (board: LibraryBoardListItem) => void) => () =>
  {
    setOpen(false)
    action(board)
  }

  const hasNonDestructiveAction =
    onRequestRename !== undefined || onDuplicate !== undefined

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Board actions for ${board.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={handleTriggerClick}
        className={`${TRIGGER_BASE} ${TRIGGER_BY_VARIANT[variant]}`}
      >
        <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2.5} />
      </button>
      {open && (
        <OverlayMenuSurface
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${board.title}`}
          className="absolute right-0 z-30 mt-1.5 w-44 origin-top"
        >
          <ul role="none" className="flex flex-col">
            {onRequestRename && (
              <li role="none">
                <OverlayMenuItem
                  role="menuitem"
                  density="compact"
                  onClick={closeAndRun(onRequestRename)}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Rename
                </OverlayMenuItem>
              </li>
            )}
            {onDuplicate && (
              <li role="none">
                <OverlayMenuItem
                  role="menuitem"
                  density="compact"
                  onClick={closeAndRun(onDuplicate)}
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Duplicate
                </OverlayMenuItem>
              </li>
            )}
            {hasNonDestructiveAction && <OverlayDivider />}
            <li role="none">
              <OverlayMenuItem
                role="menuitem"
                density="compact"
                onClick={closeAndRun(onRequestDelete)}
                className="text-[var(--t-destructive-hover)] hover:text-[var(--t-destructive-hover)]"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                Delete board
              </OverlayMenuItem>
            </li>
          </ul>
        </OverlayMenuSurface>
      )}
    </div>
  )
}
