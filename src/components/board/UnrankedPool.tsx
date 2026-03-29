// src/components/board/UnrankedPool.tsx
// droppable pool of items not yet assigned to a tier

import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useCallback, useMemo, useState } from 'react'

import { useImageImport } from '../../hooks/useImageImport'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { getEffectiveUnrankedItemIds } from '../../utils/dragSnapshot'
import { UNRANKED_CONTAINER_ID } from '../../utils/constants'
import { TierItem } from './TierItem'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { UploadDropzone } from '../ui/UploadDropzone'

export const UnrankedPool = () =>
{
  const compactMode = useSettingsStore((state) => state.compactMode)
  const confirmBeforeDelete = useSettingsStore(
    (state) => state.confirmBeforeDelete
  )
  const storedUnrankedItemIds = useTierListStore(
    (state) => state.unrankedItemIds
  )
  const dragPreview = useTierListStore((state) => state.dragPreview)
  const items = useTierListStore((state) => state.items)
  const unrankedItemIds = useMemo(
    () =>
      dragPreview
        ? getEffectiveUnrankedItemIds(storedUnrankedItemIds, dragPreview)
        : storedUnrankedItemIds,
    [dragPreview, storedUnrankedItemIds]
  )
  const itemCount = useTierListStore((state) => Object.keys(state.items).length)
  const removeItem = useTierListStore((state) => state.removeItem)

  const {
    inputRef: fileInputRef,
    isDraggingFiles,
    isProcessing,
    openFilePicker,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileInputChange,
  } = useImageImport()

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const handleRequestDelete = useCallback(
    (itemId: string) =>
    {
      if (confirmBeforeDelete)
      {
        setPendingDeleteId(itemId)
      }
      else
      {
        removeItem(itemId)
      }
    },
    [confirmBeforeDelete, removeItem]
  )

  // register the pool as a droppable container w/ the unranked ID
  const droppableData = useMemo(
    () => ({ type: 'container' as const, containerId: UNRANKED_CONTAINER_ID }),
    []
  )
  const { setNodeRef, isOver } = useDroppable({
    id: UNRANKED_CONTAINER_ID,
    data: droppableData,
  })

  return (
    <section
      className={`border border-[var(--t-border)] bg-[var(--t-bg-page)] ${compactMode ? 'mt-1 p-1.5' : 'mt-3 p-3'}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--t-text-muted)]">
          Unranked
        </h2>
        {/* show total item count across the entire board */}
        <span className="text-xs text-[var(--t-text-faint)]">
          {itemCount} total items
        </span>
      </div>

      <SortableContext items={unrankedItemIds} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          data-testid="unranked-container"
          data-tier-id={UNRANKED_CONTAINER_ID}
          className={`flex min-h-24 flex-wrap border border-dashed p-2 transition ${compactMode ? 'gap-0' : 'gap-[2px]'} ${
            isOver
              ? 'border-[var(--t-border-hover)] bg-[var(--t-bg-drag-over)]'
              : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]'
          }`}
        >
          {unrankedItemIds.length === 0 ? (
            // empty state — click to open file picker, or drop images directly
            <UploadDropzone
              variant="empty"
              isDraggingFiles={isDraggingFiles}
              isProcessing={isProcessing}
              openFilePicker={openFilePicker}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ) : (
            unrankedItemIds.map((itemId) => (
              <TierItem
                key={itemId}
                itemId={itemId}
                containerId={UNRANKED_CONTAINER_ID}
                onRequestDelete={handleRequestDelete}
              />
            ))
          )}
        </div>
      </SortableContext>

      {/* hidden file input for the empty-state click-to-upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete item?"
        description={`Remove "${items[pendingDeleteId!]?.label ?? 'this item'}" from the board?`}
        confirmText="Delete"
        onConfirm={() =>
        {
          if (pendingDeleteId) removeItem(pendingDeleteId)
          setPendingDeleteId(null)
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  )
}
