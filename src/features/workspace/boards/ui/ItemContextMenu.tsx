// src/features/workspace/boards/ui/ItemContextMenu.tsx
// right-click menu for a tier item — edit image, move-to, & remove

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ArrowRight, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useImageEditorStore } from '~/features/workspace/imageEditor/model/useImageEditorStore'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { useMenuOverflowFlipRefs } from '~/shared/overlay/menuOverflow'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'
import { OVERLAY_VIEWPORT_MARGIN_PX } from '~/shared/overlay/uiMeasurements'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

interface ItemContextMenuProps
{
  itemId: ItemId
  position: { x: number; y: number }
  onClose: () => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const ItemContextMenu = ({
  itemId,
  position,
  onClose,
}: ItemContextMenuProps) =>
{
  const {
    item,
    selectionIds,
    tiers,
    moveSelectedToTier,
    moveSelectedToUnranked,
    deleteSelectedItems,
  } = useActiveBoardStore(
    useShallow((s) => ({
      item: s.items[itemId],
      selectionIds: s.selection.ids,
      tiers: s.tiers,
      moveSelectedToTier: s.moveSelectedToTier,
      moveSelectedToUnranked: s.moveSelectedToUnranked,
      deleteSelectedItems: s.deleteSelectedItems,
    }))
  )
  const paletteId = useCurrentPaletteId()

  const menuRef = useRef<HTMLDivElement | null>(null)
  const { getRef: getOverflowRef } = useMenuOverflowFlipRefs<'move'>()
  const [showMove, setShowMove] = useState(false)
  const [style, setStyle] = useState<CSSProperties>(() => ({
    position: 'fixed',
    visibility: 'hidden',
    top: position.y,
    left: position.x,
  }))

  // measure-then-position so the menu stays inside the viewport
  useLayoutEffect(() =>
  {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const top = clamp(
      position.y,
      OVERLAY_VIEWPORT_MARGIN_PX,
      Math.max(
        OVERLAY_VIEWPORT_MARGIN_PX,
        vh - rect.height - OVERLAY_VIEWPORT_MARGIN_PX
      )
    )
    const left = clamp(
      position.x,
      OVERLAY_VIEWPORT_MARGIN_PX,
      Math.max(
        OVERLAY_VIEWPORT_MARGIN_PX,
        vw - rect.width - OVERLAY_VIEWPORT_MARGIN_PX
      )
    )
    setStyle({ position: 'fixed', top, left })
  }, [position.x, position.y])

  useDismissibleLayer({
    open: true,
    layerRef: menuRef,
    onDismiss: onClose,
  })

  // dismiss on any scroll — menu is anchored to viewport coords, so staying
  // put while the underlying tile moves would be misleading
  useEffect(() =>
  {
    const handleScroll = () => onClose()
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [onClose])

  if (!item) return null

  const targetCount = selectionIds.length || 1
  const showEdit = targetCount === 1 && !!item.imageRef
  const removeLabel = targetCount > 1 ? `Remove ${targetCount} items` : 'Remove'

  return (
    <OverlayMenuSurface
      ref={menuRef}
      role="menu"
      aria-label="Item actions"
      className="z-50 min-w-44 text-sm shadow-md shadow-black/30"
      style={style}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) =>
      {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {showEdit && (
        <OverlayMenuItem
          role="menuitem"
          onClick={() =>
          {
            useImageEditorStore.getState().open({ itemId, filter: 'all' })
            onClose()
          }}
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          Edit image…
        </OverlayMenuItem>
      )}

      <div className="relative">
        <OverlayMenuItem
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={showMove}
          onClick={() => setShowMove((value) => !value)}
          className={`group justify-between gap-6 ${showMove ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''}`}
        >
          <span className="flex items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            Move to
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)]" />
        </OverlayMenuItem>

        {showMove && (
          <OverlayMenuSurface
            ref={getOverflowRef('move')}
            role="menu"
            aria-label="Move to"
            className="absolute left-[calc(100%+0.375rem)] top-[-0.375rem] z-50 min-w-32 text-sm shadow-md shadow-black/30"
          >
            <OverlayMenuItem
              role="menuitem"
              onClick={() =>
              {
                moveSelectedToUnranked()
                onClose()
              }}
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded border border-[var(--t-border)]"
                aria-hidden="true"
              />
              Unranked
            </OverlayMenuItem>
            {tiers.map((tier) =>
            {
              const bg = resolveTierColorSpec(paletteId, tier.colorSpec)
              return (
                <OverlayMenuItem
                  key={tier.id}
                  role="menuitem"
                  onClick={() =>
                  {
                    moveSelectedToTier(tier.id)
                    onClose()
                  }}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded"
                    style={{ backgroundColor: bg }}
                    aria-hidden="true"
                  />
                  {tier.name}
                </OverlayMenuItem>
              )
            })}
          </OverlayMenuSurface>
        )}
      </div>

      <OverlayDivider />

      <OverlayMenuItem
        role="menuitem"
        onClick={() =>
        {
          deleteSelectedItems()
          onClose()
        }}
        className="text-[var(--t-destructive)]"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        {removeLabel}
      </OverlayMenuItem>
    </OverlayMenuSurface>
  )
}
