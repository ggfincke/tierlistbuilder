// src/features/workspace/boards/ui/UnrankedPool.tsx
// droppable pool of items not yet assigned to a tier, w/ search filter

import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Search, X } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useImageImport } from '~/features/workspace/settings/model/useImageImport'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  createSelectBoardItemById,
  filterItemIdsByLabel,
  selectActiveItemCount,
} from '~/features/workspace/boards/model/slices/selectors'
import { useEffectiveUnrankedItemIds } from '~/features/workspace/boards/model/useEffectiveBoard'
import { getBoardItemAspectRatio } from '~/features/workspace/boards/lib/aspectRatio'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { UNRANKED_CONTAINER_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import { TierItem } from './TierItem'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { TextInput } from '~/shared/ui/TextInput'
import { UploadDropzone } from '~/shared/ui/UploadDropzone'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { formatCountedWord } from '~/shared/lib/pluralize'

interface UnrankedSearchResultsProps
{
  unrankedItemIds: ItemId[]
  searchQuery: string
  children: (filteredIds: ItemId[]) => ReactNode
}

const UnrankedSearchResults = ({
  unrankedItemIds,
  searchQuery,
  children,
}: UnrankedSearchResultsProps) =>
{
  const filteredIds = useActiveBoardStore(
    useShallow((state) =>
      filterItemIdsByLabel(state.items, unrankedItemIds, searchQuery)
    )
  )

  return children(filteredIds)
}

interface PendingDeleteDialogProps
{
  itemId: ItemId
  onConfirm: () => void
  onCancel: () => void
}

const PendingDeleteDialog = ({
  itemId,
  onConfirm,
  onCancel,
}: PendingDeleteDialogProps) =>
{
  const selectItem = useMemo(() => createSelectBoardItemById(itemId), [itemId])
  const item = useActiveBoardStore(selectItem)

  return (
    <ConfirmDialog
      open
      title="Delete item?"
      description={`Remove "${item?.label ?? 'this item'}" from the board?`}
      confirmText="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

export const UnrankedPool = () =>
{
  const { compactMode, boardLocked, itemSize, confirmBeforeDelete } =
    useSettingsStore(
      useShallow((state) => ({
        compactMode: state.compactMode,
        boardLocked: state.boardLocked,
        itemSize: state.itemSize,
        confirmBeforeDelete: state.confirmBeforeDelete,
      }))
    )
  const removeItem = useActiveBoardStore((state) => state.removeItem)
  const itemCount = useActiveBoardStore(selectActiveItemCount)
  const boardAspectRatio = useActiveBoardStore((state) =>
    getBoardItemAspectRatio(state)
  )
  const boardDefaultFit = useActiveBoardStore(
    (state) => state.defaultItemImageFit
  )
  const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
    itemSize,
    boardAspectRatio
  )
  const unrankedItemIds = useEffectiveUnrankedItemIds()

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

  const [pendingDeleteId, setPendingDeleteId] = useState<ItemId | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const handleRequestDelete = useCallback(
    (itemId: ItemId) =>
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

  const isSearching = searchQuery.trim().length > 0
  const renderPoolContent = (visibleIds: ItemId[]) => (
    <>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--t-text-muted)]">
          Unranked
        </h2>
        <span className="text-xs text-[var(--t-text-faint)]">
          {isSearching
            ? `${visibleIds.length} of ${formatCountedWord(
                unrankedItemIds.length,
                'item'
              )}`
            : `${formatCountedWord(itemCount, 'item')} total`}
        </span>
      </div>

      {unrankedItemIds.length > 0 && (
        <div className="relative mb-2">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--t-text-faint)]" />
          <TextInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            aria-label="Search unranked items"
            className="w-full py-1.5 pr-7 pl-8 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          />
          {isSearching && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-[var(--t-text-faint)] hover:text-[var(--t-text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
        <div
          ref={setNodeRef}
          data-testid={UNRANKED_CONTAINER_TEST_ID}
          data-tier-id={UNRANKED_CONTAINER_ID}
          className={`unranked-pool-grid flex min-h-24 flex-wrap border border-dashed p-2 transition ${compactMode ? 'gap-0' : 'gap-[2px]'} ${
            isOver
              ? 'border-[var(--t-border-hover)] bg-[var(--t-bg-drag-over)]'
              : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]'
          }`}
        >
          {visibleIds.length === 0 && !boardLocked && !isSearching ? (
            // empty state: click to open file picker, or drop images directly
            <UploadDropzone
              variant="empty"
              isDraggingFiles={isDraggingFiles}
              isProcessing={isProcessing}
              openFilePicker={openFilePicker}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ) : visibleIds.length === 0 ? (
            <p className="flex min-h-24 w-full items-center justify-center text-sm text-[var(--t-text-faint)]">
              {isSearching ? 'No matching items' : 'No unranked items'}
            </p>
          ) : (
            visibleIds.map((itemId) => (
              <TierItem
                key={itemId}
                itemId={itemId}
                containerId={UNRANKED_CONTAINER_ID}
                onRequestDelete={handleRequestDelete}
                slotWidth={slotWidth}
                slotHeight={slotHeight}
                boardDefaultFit={boardDefaultFit}
              />
            ))
          )}
        </div>
      </SortableContext>
    </>
  )

  return (
    <section
      className={`border border-[var(--t-border)] bg-[var(--t-bg-page)] ${compactMode ? 'mt-1 p-1.5' : 'mt-3 p-3'}`}
    >
      {isSearching ? (
        <UnrankedSearchResults
          unrankedItemIds={unrankedItemIds}
          searchQuery={searchQuery}
        >
          {renderPoolContent}
        </UnrankedSearchResults>
      ) : (
        renderPoolContent(unrankedItemIds)
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      {pendingDeleteId && (
        <PendingDeleteDialog
          itemId={pendingDeleteId}
          onConfirm={() =>
          {
            removeItem(pendingDeleteId)
            setPendingDeleteId(null)
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </section>
  )
}
