// src/components/board/UnrankedPool.tsx
// droppable pool of items not yet assigned to a tier
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useMemo } from 'react'

import { useTierListStore } from '../../store/useTierListStore'
import { getEffectiveUnrankedItemIds } from '../../utils/dragInsertion'
import { UNRANKED_CONTAINER_ID } from '../../utils/constants'
import { TierItem } from './TierItem'

export const UnrankedPool = () => {
  const storedUnrankedItemIds = useTierListStore((state) => state.unrankedItemIds)
  const dragPreview = useTierListStore((state) => state.dragPreview)
  const unrankedItemIds = useMemo(
    () =>
      dragPreview
        ? getEffectiveUnrankedItemIds(storedUnrankedItemIds, dragPreview)
        : storedUnrankedItemIds,
    [dragPreview, storedUnrankedItemIds],
  )
  const itemCount = useTierListStore((state) => Object.keys(state.items).length)

  // register the pool as a droppable container w/ the unranked ID
  const { setNodeRef, isOver } = useDroppable({
    id: UNRANKED_CONTAINER_ID,
    data: {
      type: 'container',
      containerId: UNRANKED_CONTAINER_ID,
    },
  })

  return (
    <section className="mt-3 border border-[#444] bg-[#232323] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#aaa]">Unranked</h2>
        {/* show total item count across the entire board */}
        <span className="text-xs text-[#888]">{itemCount} total items</span>
      </div>

      <SortableContext items={unrankedItemIds} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          data-testid="unranked-container"
          data-tier-id={UNRANKED_CONTAINER_ID}
          className={`flex min-h-24 flex-wrap gap-[2px] border border-dashed p-2 transition ${
            isOver
              ? 'border-[#888] bg-[#323232]'
              : 'border-[#555] bg-[#2b2b2b]'
          }`}
        >
          {unrankedItemIds.length === 0 ? (
            // empty state prompt shown before any items are uploaded
            <p className="self-center text-sm text-[#888]">
              Upload images or add text items via Settings.<br />
              Drag items into tier rows to rank them.
            </p>
          ) : (
            unrankedItemIds.map((itemId) => (
              <TierItem
                key={itemId}
                itemId={itemId}
                containerId={UNRANKED_CONTAINER_ID}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  )
}
