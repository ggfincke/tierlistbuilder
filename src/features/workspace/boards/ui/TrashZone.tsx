// src/features/workspace/boards/ui/TrashZone.tsx
// droppable trash zone — appears during drag to allow item deletion

import { useDroppable } from '@dnd-kit/core'
import { Trash2 } from 'lucide-react'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { TRASH_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'

export const TrashZone = () =>
{
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  const activeItemId = useActiveBoardStore((state) => state.activeItemId)
  const keyboardMode = useActiveBoardStore((state) => state.keyboardMode)
  const isDragActive =
    !boardLocked && activeItemId !== null && keyboardMode !== 'dragging'

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
          ? 'border-[color-mix(in_srgb,var(--t-destructive)_60%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)] text-[var(--t-destructive-hover)]'
          : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-faint)]'
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
