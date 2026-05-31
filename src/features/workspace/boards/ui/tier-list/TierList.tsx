// src/features/workspace/boards/ui/tier-list/TierList.tsx
// * top-level tier list — wraps dnd-kit context, tier rows, unranked pool, & drag overlay

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  type MeasuringConfiguration,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useEffectiveTiers } from '~/features/workspace/boards/model/useEffectiveBoard'
import { resolveExportBackground } from '~/shared/theme/tokens'
import { announceDragCancelled } from '~/features/workspace/boards/lib/containerLabel'
import type { ToolbarPosition } from '@tierlistbuilder/contracts/platform/preferences'
import { isVerticalPosition } from '~/shared/overlay/toolbarPosition'
import { TIER_LIST_BOARD_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { useDragAndDrop } from '~/features/workspace/boards/dnd/useDragAndDrop'
import { ActiveDragOverlayItem } from '~/features/workspace/boards/ui/drag-overlay/DragOverlayItem'
import { DragOverlayTierRow } from '~/features/workspace/boards/ui/drag-overlay/DragOverlayTierRow'
import { TierRow } from '~/features/workspace/boards/ui/tier-list/TierRow'
import { TrashZone } from '~/features/workspace/boards/ui/tier-list/TrashZone'
import { UnrankedPool } from '~/features/workspace/boards/ui/tier-list/UnrankedPool'

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

// remeasure droppables only while dragging — the default 'Always' strategy
// re-runs every frame on tall boards & trips dnd-kit's "Maximum update depth"
// guard. hoisted so the config reference is stable across renders
const DND_MEASURING: MeasuringConfiguration = {
  droppable: {
    strategy: MeasuringStrategy.WhileDragging,
  },
}

interface TierListProps
{
  toolbar: ReactNode
  toolbarPosition: ToolbarPosition
  // override the default workspace pool (e.g. showcase has no image import)
  pool?: ReactNode
}

export const TierList = ({ toolbar, toolbarPosition, pool }: TierListProps) =>
{
  const isVertical = isVerticalPosition(toolbarPosition)
  const { exportBackgroundOverride, themeId, compactMode } =
    usePreferencesStore(
      useShallow((state) => ({
        exportBackgroundOverride: state.exportBackgroundOverride,
        themeId: state.themeId,
        compactMode: state.compactMode,
      }))
    )
  const exportBackgroundColor = resolveExportBackground(
    exportBackgroundOverride,
    themeId
  )
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
          announceDragCancelled()
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
    activeTierRect,
    collisionDetection,
    overlayModifiers,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useDragAndDrop()

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={DND_ACCESSIBILITY}
      measuring={DND_MEASURING}
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

        {pool ?? <UnrankedPool />}

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
          <DragOverlayTierRow
            tier={activeTier}
            width={activeTierRect?.width ?? null}
            height={activeTierRect?.height ?? null}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
