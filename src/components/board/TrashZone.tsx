// src/components/board/TrashZone.tsx
// droppable trash zone — appears during drag to allow item deletion

import { useDroppable } from '@dnd-kit/core'
import { Trash2 } from 'lucide-react'

import { useTierListStore } from '../../store/useTierListStore'
import { TRASH_CONTAINER_ID } from '../../utils/constants'

export const TrashZone = () =>
{
  const activeItemId = useTierListStore((state) => state.activeItemId)
  const isDragActive = activeItemId !== null

  const { setNodeRef, isOver } = useDroppable({
    id: TRASH_CONTAINER_ID,
    data: { type: 'trash' },
  })

  return (
    <div
      ref={setNodeRef}
      className={`mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed transition-all duration-200 ${
        isDragActive
          ? 'min-h-14 opacity-100'
          : 'pointer-events-none h-0 min-h-0 overflow-hidden border-0 opacity-0'
      } ${
        isOver
          ? 'border-red-500/60 bg-red-500/10 text-red-400'
          : 'border-[#555] bg-[#2b2b2b] text-[#888]'
      }`}
    >
      <Trash2
        className={`h-5 w-5 transition-transform duration-150 ${isOver ? 'scale-110' : ''}`}
      />
      <span className="text-sm font-medium">
        {isOver ? 'Release to delete' : 'Drop here to delete'}
      </span>
    </div>
  )
}
