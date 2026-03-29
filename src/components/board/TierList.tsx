// src/components/board/TierList.tsx
// * top-level tier list — wraps dnd-kit context, tier rows, unranked pool, & drag overlay

import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core'
import { useEffect, useMemo, useRef } from 'react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { THEMES } from '../../theme/tokens'
import { getEffectiveTiers } from '../../utils/dragSnapshot'
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

  const {
    sensors,
    activeItem,
    collisionDetection,
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
          {tiers.map((tier, index) => (
            <TierRow
              key={tier.id}
              tier={tier}
              index={index}
              totalTiers={tiers.length}
            />
          ))}
        </div>
      </div>

      <UnrankedPool />

      <TrashZone />

      {/* render ghost item in the overlay only while a drag is active */}
      <DragOverlay>
        {activeItem ? <DragOverlayItem item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
