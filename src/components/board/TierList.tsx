// src/components/board/TierList.tsx
// * top-level tier list — wraps dnd-kit context, tier rows, unranked pool, & drag overlay

import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core'
import { useMemo, type RefObject } from 'react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { getEffectiveTiers } from '../../utils/dragInsertion'
import { useDragAndDrop } from '../../hooks/useDragAndDrop'
import { DragOverlayItem } from './DragOverlayItem'
import { TierRow } from './TierRow'
import { TrashZone } from './TrashZone'
import { UnrankedPool } from './UnrankedPool'

interface TierListProps
{
  // ref forwarded from App — attached to the export capture wrapper
  exportRef: RefObject<HTMLDivElement | null>
}

export const TierList = ({ exportRef }: TierListProps) =>
{
  const exportBackgroundColor = useSettingsStore(
    (state) => state.exportBackgroundColor
  )
  const compactMode = useSettingsStore((state) => state.compactMode)
  const storedTiers = useTierListStore((state) => state.tiers)
  const dragPreview = useTierListStore((state) => state.dragPreview)
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
          ref={exportRef}
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
