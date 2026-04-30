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
import { useShallow } from 'zustand/react/shallow'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useEffectiveTiers } from '~/features/workspace/boards/model/useEffectiveBoard'
import { THEMES } from '~/shared/theme/tokens'
import { announce } from '~/shared/a11y/announce'
import { getContrastingTextShadow, getTextColor } from '~/shared/lib/color'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import type { ToolbarPosition } from '@tierlistbuilder/contracts/workspace/settings'
import { isVerticalPosition } from '~/shared/layout/toolbarPosition'
import { TIER_LIST_BOARD_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { useDragAndDrop } from '~/features/workspace/boards/dnd/useDragAndDrop'
import { ActiveDragOverlayItem } from './DragOverlayItem'
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
  const { boardLocked, exportBackgroundOverride, themeId, compactMode } =
    useSettingsStore(
      useShallow((state) => ({
        boardLocked: state.boardLocked,
        exportBackgroundOverride: state.exportBackgroundOverride,
        themeId: state.themeId,
        compactMode: state.compactMode,
      }))
    )
  const exportBackgroundColor =
    exportBackgroundOverride ?? THEMES[themeId]['export-bg']
  const { dragGroupCount, keyboardMode } = useActiveBoardStore(
    useShallow((state) => ({
      dragGroupCount: state.dragGroupIds.length,
      keyboardMode: state.keyboardMode,
    }))
  )
  const tiers = useEffectiveTiers()
  const boardShellRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  // sync keyboard focus item data attribute imperatively to avoid re-rendering
  // the entire subtree on every arrow key press. selector-based subscribe so
  // drag updates (~60Hz) don't fire a no-op setAttribute each time
  useEffect(() =>
  {
    return useActiveBoardStore.subscribe(
      (state) => state.keyboardFocusItemId,
      (focusId) =>
      {
        boardRef.current?.setAttribute(
          'data-keyboard-focus-item-id',
          focusId ?? ''
        )
      }
    )
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

  const tierIds = useMemo(() => tiers.map((t) => t.id), [tiers])

  const {
    sensors,
    activeItemId,
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
        <div
          className={`${compactMode ? 'mt-1' : 'mt-3'} ${TOOLBAR_LAYOUT_CLASS[toolbarPosition]}`}
        >
          <div className={`${isVertical ? 'min-w-0 flex-1' : ''}`}>
            <div className="overflow-x-auto">
              <div
                id="tier-list"
                ref={boardRef}
                role="region"
                aria-label="Tier list board"
                data-testid={TIER_LIST_BOARD_TEST_ID}
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

          <div className={isVertical ? 'sticky top-4' : ''}>{toolbar}</div>
        </div>

        <UnrankedPool />

        <TrashZone />
      </div>

      <DragOverlay
        modifiers={overlayModifiers}
        dropAnimation={dragGroupCount > 1 ? null : undefined}
      >
        {activeItemId ? (
          <ActiveDragOverlayItem
            itemId={activeItemId}
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
