// src/features/library/ui/list/BoardListTable.tsx
// dense table-style list view for the My Boards page

import { memo } from 'react'
import { Pin } from 'lucide-react'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/libraryBoard'

import { makeBoardClickHandler } from '~/features/library/lib/boardClickHandler'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { BoardCardMenu } from '../cards/BoardCardMenu'
import { BoardMosaicCover } from '../cards/BoardMosaicCover'
import { TierBar } from '../cards/TierBar'
import { PublishChip } from '../chips/PublishChip'
import { SyncChip } from '../chips/SyncChip'
import { VisibilityChip } from '../chips/VisibilityChip'
import { BOARD_LIST_GRID_TEMPLATE } from './boardListGrid'

// right padding reserved on every row + the header so the absolutely-positioned
// overflow menu doesn't collide w/ the last column's content
const ROW_HORIZONTAL_PADDING = 'pl-4 pr-12'

interface BoardListRowProps
{
  board: LibraryBoardListItem
  onOpen?: (board: LibraryBoardListItem) => void
  onRequestDelete?: (board: LibraryBoardListItem) => void
  onRequestRename?: (board: LibraryBoardListItem) => void
  onDuplicate?: (board: LibraryBoardListItem) => void
  isPending?: boolean
}

const BoardListRow = memo(
  ({
    board,
    onOpen,
    onRequestDelete,
    onRequestRename,
    onDuplicate,
    isPending,
  }: BoardListRowProps) =>
  {
    const openAction = makeBoardClickHandler(onOpen, isPending, board)

    return (
      <div
        className="group relative"
        style={{ borderBottom: '1px solid var(--t-border)' }}
      >
        <button
          type="button"
          onClick={openAction.onClick}
          disabled={openAction.disabled}
          aria-label={board.title}
          aria-busy={isPending || undefined}
          className={`focus-custom grid w-full items-center gap-4 py-3 ${ROW_HORIZONTAL_PADDING} text-left transition hover:bg-[rgb(var(--t-overlay)/0.025)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] disabled:cursor-progress disabled:opacity-70`}
          style={{ gridTemplateColumns: BOARD_LIST_GRID_TEMPLATE }}
        >
          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
            <BoardMosaicCover
              items={board.coverItems}
              density="dense"
              itemAspectRatio={board.itemAspectRatio}
              autoPlate={board.autoPlate}
              defaultItemImageFit={board.defaultItemImageFit}
              defaultItemImagePadding={board.defaultItemImagePadding}
              sourceCoverMedia={board.sourceTemplateCoverMedia}
              sourceCoverFraming={board.sourceTemplateCoverFraming}
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
                {board.activeItemCount}{' '}
                {formatCountedWord(board.activeItemCount, 'item')}
                {board.tierCount > 0 && (
                  <>
                    {' · '}
                    {board.tierCount}{' '}
                    {formatCountedWord(board.tierCount, 'tier')}
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
        {onRequestDelete && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <BoardCardMenu
              board={board}
              onRequestDelete={onRequestDelete}
              onRequestRename={onRequestRename}
              onDuplicate={onDuplicate}
              disabled={isPending}
              variant="inline"
            />
          </div>
        )}
      </div>
    )
  }
)
BoardListRow.displayName = 'BoardListRow'

interface BoardListTableProps
{
  boards: readonly LibraryBoardListItem[]
  onOpenBoard?: (board: LibraryBoardListItem) => void
  onRequestDelete?: (board: LibraryBoardListItem) => void
  onRequestRename?: (board: LibraryBoardListItem) => void
  onDuplicate?: (board: LibraryBoardListItem) => void
  pendingBoardExternalId?: string | null
  pendingActionExternalId?: string | null
}

export const BoardListTable = ({
  boards,
  onOpenBoard,
  onRequestDelete,
  onRequestRename,
  onDuplicate,
  pendingBoardExternalId,
  pendingActionExternalId,
}: BoardListTableProps) => (
  <div className="overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
    <div
      className={`grid items-center gap-4 ${ROW_HORIZONTAL_PADDING} py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]`}
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
        onRequestDelete={onRequestDelete}
        onRequestRename={onRequestRename}
        onDuplicate={onDuplicate}
        isPending={
          pendingBoardExternalId === board.externalId ||
          pendingActionExternalId === board.externalId
        }
      />
    ))}
  </div>
)
