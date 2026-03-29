// src/components/board/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging

import { memo } from 'react'
import type { TierItem as TierItemType } from '../../types'
import { useSettingsStore } from '../../store/useSettingsStore'
import { ITEM_SIZE_PX, SHAPE_CLASS } from '../../utils/constants'
import { ItemContent } from './ItemContent'

interface DragOverlayItemProps
{
  // the item being dragged
  item: TierItemType
}

export const DragOverlayItem = memo(({ item }: DragOverlayItemProps) =>
{
  const itemSize = useSettingsStore((state) => state.itemSize)
  const itemShape = useSettingsStore((state) => state.itemShape)
  const sizePx = ITEM_SIZE_PX[itemSize]

  return (
    <div
      className={`overflow-hidden border border-black bg-black/40 shadow-xl ${SHAPE_CLASS[itemShape]}`}
      style={{ width: sizePx, height: sizePx }}
    >
      <ItemContent item={item} />
    </div>
  )
})
