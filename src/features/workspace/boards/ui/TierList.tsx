// src/features/workspace/boards/ui/TierList.tsx
// * top-level tier list — wraps dnd-kit context, tier rows, unranked pool, & drag overlay

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  type SensorDescriptor,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { THEMES } from '@/shared/theme/tokens'
import { announce } from '@/shared/a11y/announce'
import { getContrastingTextShadow, getTextColor } from '@/shared/lib/color'
import { getEffectiveTiers } from '@/features/workspace/boards/dnd/dragSnapshot'
import { resolveTierColorSpec } from '@/shared/theme/tierColors'
import { useCurrentPaletteId } from '@/features/workspace/settings/model/useCurrentPaletteId'
import type { ToolbarPosition } from '@/shared/types/settings'
import { isVerticalPosition } from '@/shared/layout/toolbarPosition'
import { useDragAndDrop } from '@/features/workspace/boards/dnd/useDragAndDrop'
import { DragOverlayItem } from './DragOverlayItem'
import { TierRow } from './TierRow'
import { TrashZone } from './TrashZone'
import { UnrankedPool } from './UnrankedPool'

// stable empty sensor list — passed to DndContext when keyboard mode is active
// to avoid re-creating dnd-kit's internal sensor coordinator per render
const EMPTY_SENSORS: SensorDescriptor<object>[] = []

// toolbar is rendered *after* content in DOM so it naturally paints on top
// (dropdowns won't be clipped by the tier grid); flex-reverse restores visual order
const TOOLBAR_LAYOUT_CLASS: Record<ToolbarPosition, string> = {
  top: 'flex flex-col-reverse gap-3',
  bottom: 'flex flex-col gap-3',
  left: 'flex flex-row-reverse items-center gap-3',
  right: 'flex flex-row items-center gap-3',
}

const DND_ACCESSIBILITY = {
  screenReaderInstructions: {
    draggable:
      'Press B to jump back to the board from the app chrome. On a focused item, use the arrow keys to move focus between items. Press space to pick up the focused item, use the arrow keys to move it, press space to drop, or press Escape to cancel.',
  },
}

interface TierListProps
{
  toolbar: ReactNode
  toolbarPosition: ToolbarPosition
}

export const TierList = ({ toolbar, toolbarPosition }: TierListProps) =>
{
  const isVertical = isVerticalPosition(toolbarPosition)
  const paletteId = useCurrentPaletteId()
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  const exportBackgroundOverride = useSettingsStore(
    (state) => state.exportBackgroundOverride
  )
  const themeId = useSettingsStore((state) => state.themeId)
  const exportBackgroundColor =
    exportBackgroundOverride ?? THEMES[themeId]['export-bg']
  const compactMode = useSettingsStore((state) => state.compactMode)
  const storedTiers = useActiveBoardStore((state) => state.tiers)
  const dragPreview = useActiveBoardStore((state) => state.dragPreview)
  const dragGroupCount = useActiveBoardStore(
    (state) => state.dragGroupIds.length
  )
  const keyboardMode = useActiveBoardStore((state) => state.keyboardMode)
  const boardShellRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  // sync keyboard focus item data attribute imperatively to avoid re-rendering
  // the entire subtree on every arrow key press
  useEffect(() =>
  {
    return useActiveBoardStore.subscribe((state) =>
    {
      boardRef.current?.setAttribute(
        'data-keyboard-focus-item-id',
        state.keyboardFocusItemId ?? ''
      )
    })
  }, [])

  useEffect(() =>
  {
    const boardShellElement = boardShellRef.current

    if (!boardShellElement)
    {
      return
    }

    const handleFocusOut = () =>
    {
      requestAnimationFrame(() =>
      {
        // guard: element may have been unmounted during the async frame
        if (!boardShellElement.isConnected) return

        if (boardShellElement.contains(document.activeElement))
        {
          return
        }

        const state = useActiveBoardStore.getState()

        if (state.keyboardMode === 'dragging')
        {
          state.cancelKeyboardDrag()
          announce('Drag cancelled')
          return
        }

        state.clearKeyboardMode()
      })
    }

    boardShellElement.addEventListener('focusout', handleFocusOut)

    return () =>
      boardShellElement.removeEventListener('focusout', handleFocusOut)
  }, [])

  const tiers = useMemo(
    () =>
      dragPreview ? getEffectiveTiers(storedTiers, dragPreview) : storedTiers,
    [dragPreview, storedTiers]
  )

  const tierIds = useMemo(() => tiers.map((t) => t.id), [tiers])

  const {
    sensors,
    activeItem,
    activeTier,
    collisionDetection,
    overlayModifiers,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useDragAndDrop()

  // disable all drag sensors when the board is locked
  const activeSensors = boardLocked ? EMPTY_SENSORS : sensors
  const activeTierColor = activeTier
    ? resolveTierColorSpec(paletteId, activeTier.colorSpec)
    : null
  const activeTierTextColor = activeTierColor
    ? getTextColor(activeTierColor)
    : null

  return (
    <DndContext
      sensors={activeSensors}
      collisionDetection={collisionDetection}
      accessibility={DND_ACCESSIBILITY}
      measuring={{
        // always remeasure droppables to handle dynamic content changes
        droppable: {
          strategy: MeasuringStrategy.WhileDragging,
        },
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div ref={boardShellRef}>
        {/* toolbar + tier rows wrapper — toolbar sits alongside or above/below the tiers */}
        <div
          className={`${compactMode ? 'mt-1' : 'mt-3'} ${TOOLBAR_LAYOUT_CLASS[toolbarPosition]}`}
        >
          {/* tier rows column — unranked pool & trash zone live outside so
              left/right toolbar centers on tiers only & bottom toolbar
              sits above the pool */}
          <div className={`${isVertical ? 'min-w-0 flex-1' : ''}`}>
            {/* export capture wrapper */}
            <div className="overflow-x-auto">
              <div
                id="tier-list"
                ref={boardRef}
                role="region"
                aria-label="Tier list board"
                data-testid="tier-list-board"
                data-keyboard-mode={keyboardMode}
                data-keyboard-focus-item-id=""
                tabIndex={-1}
                className="min-w-[860px]"
                style={{ backgroundColor: exportBackgroundColor }}
              >
                <SortableContext
                  items={tierIds}
                  strategy={verticalListSortingStrategy}
                >
                  {tiers.map((tier, index) => (
                    <TierRow
                      key={tier.id}
                      tier={tier}
                      index={index}
                      totalTiers={tiers.length}
                    />
                  ))}
                </SortableContext>
              </div>
            </div>
          </div>

          {/* sticky wrapper keeps the toolbar visible while scrolling tall boards */}
          <div className={isVertical ? 'sticky top-4' : ''}>{toolbar}</div>
        </div>

        <UnrankedPool />

        <TrashZone />
      </div>

      {/* render ghost in the overlay while a drag is active;
          disable default drop animation during multi-drag so the
          fan-out animation takes over immediately */}
      <DragOverlay
        modifiers={overlayModifiers}
        dropAnimation={dragGroupCount > 1 ? null : undefined}
      >
        {activeItem ? (
          <DragOverlayItem
            item={activeItem}
            groupCount={dragGroupCount > 1 ? dragGroupCount - 1 : 0}
          />
        ) : activeTier ? (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2 shadow-xl"
            style={{
              backgroundColor: activeTierColor ?? undefined,
              color: activeTierTextColor ?? undefined,
              textShadow: activeTierColor
                ? getContrastingTextShadow(activeTierColor)
                : undefined,
            }}
          >
            <span className="text-sm font-semibold">{activeTier.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
