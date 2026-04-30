// src/features/library/components/BoardListTable.tsx
// dense table-style list view for the My Lists page

import { Pin } from 'lucide-react'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

import { formatRelativeTime } from '~/features/marketplace/model/formatters'
import { Cover } from './Cover'
import { StatusPill } from './StatusPill'
import { TierBar } from './TierBar'
import { VisibilityChip } from './VisibilityChip'

interface BoardListRowProps
{
  board: LibraryBoardListItem
  onOpen?: (board: LibraryBoardListItem) => void
  isPending?: boolean
}

// shared grid template — keeps header columns aligned w/ row columns
const COLUMN_TEMPLATE =
  'minmax(56px, 56px) minmax(0, 2.6fr) minmax(120px, 1.6fr) 110px 96px 90px'

const BoardListRow = ({ board, onOpen, isPending }: BoardListRowProps) =>
{
  const isDraft = board.status === 'draft'

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
        gridTemplateColumns: COLUMN_TEMPLATE,
        borderBottom: '1px solid var(--t-border)',
      }}
    >
      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
        <Cover
          items={board.coverItems}
          density="dense"
          isDraft={isDraft}
          emptyLabel="Draft"
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
        <p className="mt-0.5 truncate text-[11px] text-[var(--t-text-muted)]">
          {board.activeItemCount}{' '}
          {board.activeItemCount === 1 ? 'item' : 'items'}
          {board.tierColors.length > 0 && (
            <>
              {' · '}
              {board.tierColors.length}{' '}
              {board.tierColors.length === 1 ? 'tier' : 'tiers'}
            </>
          )}
        </p>
      </div>
      <div className="min-w-0 pr-4">
        <TierBar board={board} height={5} showCount />
      </div>
      <div>
        <StatusPill status={board.status} />
      </div>
      <div>
        <VisibilityChip visibility={board.visibility} />
      </div>
      <div className="text-right text-[11px] tabular-nums text-[var(--t-text-faint)]">
        {formatRelativeTime(board.updatedAt)}
      </div>
    </button>
  )
}

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
        gridTemplateColumns: COLUMN_TEMPLATE,
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-bg-page)',
      }}
      role="row"
    >
      <div aria-hidden />
      <div role="columnheader">List</div>
      <div role="columnheader">Progress</div>
      <div role="columnheader">Status</div>
      <div role="columnheader">Visibility</div>
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
