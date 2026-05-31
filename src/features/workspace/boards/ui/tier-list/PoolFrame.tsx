// src/features/workspace/boards/ui/tier-list/PoolFrame.tsx
// shared unranked-pool shell — droppable grid, search, & counts. import-free so
// non-workspace surfaces (showcase) reuse it w/o the image-upload providers

import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Search, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useBoardItemSize } from '~/features/workspace/boards/model/boardRenderOverrides'
import { useBoardItemRenderSettings } from '~/features/workspace/boards/model/useBoardItemRenderSettings'
import {
  filterItemIdsByLabel,
  selectActiveItemCount,
} from '~/features/workspace/boards/model/slices/selectors'
import { useEffectiveUnrankedItemIds } from '~/features/workspace/boards/model/useEffectiveBoard'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { UNRANKED_CONTAINER_TEST_ID } from '~/shared/board-ui/boardTestIds'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import { TierItem } from '~/features/workspace/boards/ui/items/TierItem'
import { TextInput } from '~/shared/ui/TextInput'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { formatCountedWord } from '~/shared/lib/pluralize'

interface PoolSearchResultsProps
{
  unrankedItemIds: ItemId[]
  searchQuery: string
  children: (filteredIds: ItemId[]) => ReactNode
}

const PoolSearchResults = ({
  unrankedItemIds,
  searchQuery,
  children,
}: PoolSearchResultsProps) =>
{
  const filteredIds = useActiveBoardStore(
    useShallow((state) =>
      filterItemIdsByLabel(state.items, unrankedItemIds, searchQuery)
    )
  )

  return children(filteredIds)
}

interface PoolFrameProps
{
  // shown in the grid when the pool is empty, editable, & not being searched
  emptyState: ReactNode
  // optional CTA below the grid; receives search state for visibility decisions
  renderFooter?: (state: { isSearching: boolean }) => ReactNode
  title?: string
  // when true (default), boardLocked suppresses the empty state. surfaces w/o
  // an upload affordance (showcase) opt out so the editorial CTA still renders
  respectBoardLocked?: boolean
}

export const PoolFrame = ({
  emptyState,
  renderFooter,
  title = 'Unranked',
  respectBoardLocked = true,
}: PoolFrameProps) =>
{
  const itemSize = useBoardItemSize()
  const { compactMode, boardLocked } = usePreferencesStore(
    useShallow((state) => ({
      compactMode: state.compactMode,
      boardLocked: state.boardLocked,
    }))
  )
  const itemCount = useActiveBoardStore(selectActiveItemCount)
  const {
    boardAspectRatio,
    boardDefaultFit,
    boardDefaultPadding,
    boardLabels,
    boardAutoPlate,
  } = useBoardItemRenderSettings()
  const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
    itemSize,
    boardAspectRatio
  )
  const unrankedItemIds = useEffectiveUnrankedItemIds()

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
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--t-text-muted)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          {title}
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
          {visibleIds.length === 0 &&
          (!respectBoardLocked || !boardLocked) &&
          !isSearching ? (
            emptyState
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
                boardDefaultPadding={boardDefaultPadding}
                boardLabels={boardLabels}
                boardAutoPlate={boardAutoPlate}
              />
            ))
          )}
        </div>
      </SortableContext>

      {renderFooter?.({ isSearching })}
    </>
  )

  return (
    <section
      className={`border border-[var(--t-border)] bg-[var(--t-bg-page)] ${compactMode ? 'mt-1 p-1.5' : 'mt-3 p-3'}`}
    >
      {isSearching ? (
        <PoolSearchResults
          unrankedItemIds={unrankedItemIds}
          searchQuery={searchQuery}
        >
          {renderPoolContent}
        </PoolSearchResults>
      ) : (
        renderPoolContent(unrankedItemIds)
      )}
    </section>
  )
}
