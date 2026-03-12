// src/components/board/UnrankedPool.tsx
// droppable pool of items not yet assigned to a tier
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { useMemo, useRef, useState } from 'react'

import { useTierListStore } from '../../store/useTierListStore'
import { getEffectiveUnrankedItemIds } from '../../utils/dragInsertion'
import { UNRANKED_CONTAINER_ID } from '../../utils/constants'
import { processImageFiles } from '../../utils/imageResize'
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
  const addItems = useTierListStore((state) => state.addItems)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  // process dropped or selected image files
  const handleFiles = async (incomingFiles: FileList | File[]) => {
    const files = Array.from(incomingFiles)
    if (files.length === 0) return

    const hasImages = files.some((f) => f.type.startsWith('image/'))
    if (!hasImages) {
      setRuntimeError('No image files were found. Please upload PNG, JPG, WEBP, or GIF files.')
      setIsDraggingFiles(false)
      return
    }

    const newItems = await processImageFiles(files)
    if (newItems.length > 0) addItems(newItems)
    setIsDraggingFiles(false)
  }

  // register the pool as a droppable container w/ the unranked ID
  const droppableData = useMemo(() => ({ type: 'container' as const, containerId: UNRANKED_CONTAINER_ID }), [])
  const { setNodeRef, isOver } = useDroppable({
    id: UNRANKED_CONTAINER_ID,
    data: droppableData,
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
            // empty state — click to open file picker, or drop images directly
            <div
              className={`flex min-h-16 w-full cursor-pointer items-center justify-center text-center transition ${
                isDraggingFiles ? 'text-sky-200' : 'text-[#888] hover:text-[#aaa]'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDraggingFiles(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsDraggingFiles(false)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                void handleFiles(e.dataTransfer.files)
              }}
            >
              <p className="text-sm">
                {isDraggingFiles ? 'Drop images here' : 'Click to upload images, or drag files here'}
              </p>
            </div>
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

      {/* hidden file input for the empty-state click-to-upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </section>
  )
}
