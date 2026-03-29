// src/components/board/TierList.tsx
// * top-level tier list — wraps dnd-kit context, tier rows, unranked pool, & drag overlay

import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useMemo, useRef } from 'react'

const EMPTY_SENSORS: never[] = []

import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { THEMES } from '../../theme/tokens'
import { getEffectiveTiers } from '../../utils/dragSnapshot'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { useDragAndDrop } from '../../hooks/useDragAndDrop'
import { DragOverlayItem } from './DragOverlayItem'
import { TierRow } from './TierRow'
import { TrashZone } from './TrashZone'
import { UnrankedPool } from './UnrankedPool'

const DND_ACCESSIBILITY = {
  screenReaderInstructions: {
    draggable:
      'Focus an item & press the space bar to enter keyboard mode. Use the arrow keys to move keyboard focus between items. Press space again to pick up the focused item, use the arrow keys to move it, press space to drop it, or press Escape to exit keyboard mode.',
  },
}

export const TierList = () =>
{
  const paletteId = useCurrentPaletteId()
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  const exportBackgroundOverride = useSettingsStore(
    (state) => state.exportBackgroundOverride
  )
  const themeId = useSettingsStore((state) => state.themeId)
  const exportBackgroundColor =
    exportBackgroundOverride ?? THEMES[themeId]['export-bg']
  const compactMode = useSettingsStore((state) => state.compactMode)
  const storedTiers = useTierListStore((state) => state.tiers)
  const dragPreview = useTierListStore((state) => state.dragPreview)
  const keyboardMode = useTierListStore((state) => state.keyboardMode)
  const boardRef = useRef<HTMLDivElement>(null)

  // sync keyboard focus item data attribute imperatively to avoid re-rendering
  // the entire subtree on every arrow key press
  useEffect(() =>
  {
    return useTierListStore.subscribe((state) =>
    {
      boardRef.current?.setAttribute(
        'data-keyboard-focus-item-id',
        state.keyboardFocusItemId ?? ''
      )
    })
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
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  } = useDragAndDrop()

  // disable all drag sensors when the board is locked
  const activeSensors = boardLocked ? EMPTY_SENSORS : sensors

  return (
    <DndContext
      sensors={activeSensors}
      collisionDetection={collisionDetection}
      accessibility={DND_ACCESSIBILITY}
      measuring={{
        // always remeasure droppables to handle dynamic content changes
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* export capture wrapper — min-width prevents layout collapse on narrow screens */}
      <div className={`overflow-x-auto ${compactMode ? 'mt-1' : 'mt-3'}`}>
        <div
          ref={boardRef}
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

      <UnrankedPool />

      <TrashZone />

      {/* render ghost in the overlay while a drag is active */}
      <DragOverlay>
        {activeItem ? (
          <DragOverlayItem item={activeItem} />
        ) : activeTier ? (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-2 shadow-xl"
            style={{
              backgroundColor: resolveTierColorSpec(
                paletteId,
                activeTier.colorSpec
              ),
              color: '#fff',
              textShadow: '0 0 2px rgba(0,0,0,0.4)',
            }}
          >
            <span className="text-sm font-semibold">{activeTier.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
