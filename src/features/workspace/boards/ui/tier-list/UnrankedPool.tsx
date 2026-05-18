// src/features/workspace/boards/ui/tier-list/UnrankedPool.tsx
// droppable pool of items not yet assigned to a tier, w/ search filter

import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Library, Search, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { useImageImport } from '~/features/workspace/settings/model/useImageImport'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  filterItemIdsByLabel,
  selectActiveItemCount,
} from '~/features/workspace/boards/model/slices/selectors'
import { useEffectiveUnrankedItemIds } from '~/features/workspace/boards/model/useEffectiveBoard'
import { getBoardItemAspectRatio } from '~/shared/board-ui/aspectRatio'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { UNRANKED_CONTAINER_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import { TierItem } from '../items/TierItem'
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

export const UnrankedPool = () =>
{
  const { compactMode, boardLocked, itemSize } = usePreferencesStore(
    useShallow((state) => ({
      compactMode: state.compactMode,
      boardLocked: state.boardLocked,
      itemSize: state.itemSize,
    }))
  )
  const itemCount = useActiveBoardStore(selectActiveItemCount)
  const { boardAspectRatio, boardDefaultFit, boardLabels } =
    useActiveBoardStore(
      useShallow((state) => ({
        boardAspectRatio: getBoardItemAspectRatio(state),
        boardDefaultFit: state.defaultItemImageFit,
        boardLabels: state.labels,
      }))
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

  const [searchQuery, setSearchQuery] = useState('')

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
        {/* JetBrains Mono caps eyebrow — matches the Scoreboard editorial
            rhythm. The font family resolves to --ts-mono (always loaded)
            so it stays mono even when the user picks a non-default body
            text style. */}
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--t-text-muted)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          Unranked
        </h2>
        <span
          className="text-[10px] tracking-[0.14em] text-[var(--t-text-faint)] uppercase"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
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
            <div className="flex min-h-24 w-full flex-col items-center justify-center gap-2 text-center text-sm text-[var(--t-text-faint)]">
              <p>
                {isSearching
                  ? 'No unranked items match your search.'
                  : 'No unranked items'}
              </p>
              {isSearching && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="focus-custom rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1 text-xs font-semibold text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            visibleIds.map((itemId) => (
              <TierItem
                key={itemId}
                itemId={itemId}
                containerId={UNRANKED_CONTAINER_ID}
                slotWidth={slotWidth}
                slotHeight={slotHeight}
                boardDefaultFit={boardDefaultFit}
                boardLabels={boardLabels}
              />
            ))
          )}
        </div>
      </SortableContext>

      {itemCount === 0 && !boardLocked && !isSearching && (
        <div className="mt-2 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.02)] px-3 py-3 text-center">
          <p className="text-xs text-[var(--t-text-muted)]">
            Don't have items yet? Start from a community template.
          </p>
          <Link
            to={TEMPLATES_ROUTE_PATH}
            className="focus-custom inline-flex items-center gap-1.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            <Library className="h-3 w-3" strokeWidth={1.8} />
            Browse templates
          </Link>
        </div>
      )}
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
    </section>
  )
}
