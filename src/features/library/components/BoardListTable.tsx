// src/features/library/components/BoardListTable.tsx
// dense table-style list view for the My Boards page

import { memo } from 'react'
import { Pin } from 'lucide-react'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

import { formatRelativeTime, pluralize } from '~/shared/catalog/formatters'
import { Cover } from './Cover'
import { PublishChip } from './PublishChip'
import { SyncChip } from './SyncChip'
import { TierBar } from './TierBar'
import { VisibilityChip } from './VisibilityChip'
import { BOARD_LIST_GRID_TEMPLATE } from './boardListGrid'

interface BoardListRowProps
{
  board: LibraryBoardListItem
  onOpen?: (board: LibraryBoardListItem) => void
  isPending?: boolean
}

const BoardListRow = memo(({ board, onOpen, isPending }: BoardListRowProps) =>
{
  const isDraft = board.publishState === 'draft'

  const handleClick = () =>
  {
    if (!onOpen || isPending) return
    onOpen(board)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!onOpen || isPending}
      aria-label={`${board.title}`}
      aria-busy={isPending || undefined}
      className="focus-custom grid w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-[rgb(var(--t-overlay)/0.025)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-progress disabled:opacity-70"
      style={{
        gridTemplateColumns: BOARD_LIST_GRID_TEMPLATE,
        borderBottom: '1px solid var(--t-border)',
      }}
    >
      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
        <Cover
          items={board.coverItems}
          density="dense"
          isDraft={isDraft}
          title={board.title}
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {board.pinned && (
            <Pin
              className="h-3 w-3 text-[var(--t-text-muted)]"
              strokeWidth={2}
              aria-hidden
            />
          )}
          <h4 className="truncate text-[13px] font-semibold text-[var(--t-text)]">
            {board.title}
          </h4>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--t-text-muted)]">
          <span className="truncate">
            {board.activeItemCount} {pluralize(board.activeItemCount, 'item')}
            {board.tierColors.length > 0 && (
              <>
                {' · '}
                {board.tierColors.length}{' '}
                {pluralize(board.tierColors.length, 'tier')}
              </>
            )}
          </span>
          <VisibilityChip visibility={board.visibility} />
        </div>
      </div>
      <div className="min-w-0 pr-4">
        <TierBar board={board} height={5} showCount />
      </div>
      <div className="flex flex-col items-start gap-1">
        <PublishChip state={board.publishState} variant="inline" />
        <SyncChip state={board.syncState} variant="inline" />
      </div>
      <div className="text-right text-[11px] tabular-nums text-[var(--t-text-faint)]">
        {formatRelativeTime(board.updatedAt)}
      </div>
    </button>
  )
})
BoardListRow.displayName = 'BoardListRow'

interface BoardListTableProps
{
  boards: readonly LibraryBoardListItem[]
  onOpenBoard?: (board: LibraryBoardListItem) => void
  pendingBoardExternalId?: string | null
}

export const BoardListTable = ({
  boards,
  onOpenBoard,
  pendingBoardExternalId,
}: BoardListTableProps) => (
  <div className="overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
    <div
      className="grid items-center gap-4 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]"
      style={{
        gridTemplateColumns: BOARD_LIST_GRID_TEMPLATE,
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-bg-page)',
      }}
      role="row"
    >
      <div aria-hidden />
      <div role="columnheader">Board</div>
      <div role="columnheader">Progress</div>
      <div role="columnheader">Status</div>
      <div role="columnheader" className="text-right">
        Updated
      </div>
    </div>
    {boards.map((board) => (
      <BoardListRow
        key={board.externalId}
        board={board}
        onOpen={onOpenBoard}
        isPending={pendingBoardExternalId === board.externalId}
      />
    ))}
  </div>
)
