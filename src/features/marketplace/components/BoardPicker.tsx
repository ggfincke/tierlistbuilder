// src/features/marketplace/components/BoardPicker.tsx
// radio-group board selector for the publish modal — only shows boards that
// are already cloud-synced & non-empty since publishFromBoard rejects either

import { Layers } from 'lucide-react'
import { useId } from 'react'

import type { PublishableBoard } from '~/features/marketplace/model/useMyPublishableBoards'
import { formatRelativeTime } from '~/shared/catalog/formatters'

interface BoardPickerProps
{
  boards: readonly PublishableBoard[]
  hasUnsyncedBoards: boolean
  selected: PublishableBoard | null
  onChange: (next: PublishableBoard) => void
}

export const BoardPicker = ({
  boards,
  hasUnsyncedBoards,
  selected,
  onChange,
}: BoardPickerProps) =>
{
  const groupId = useId()

  if (boards.length === 0)
  {
    return (
      <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-4 text-xs text-[var(--t-text-muted)]">
        <p className="font-medium text-[var(--t-text)]">
          No publishable boards yet.
        </p>
        <p className="mt-1">
          Open a board with at least one item, wait for cloud sync, then come
          back to publish it.
        </p>
        {hasUnsyncedBoards && (
          <p className="mt-2 text-[var(--t-text-faint)]">
            Some local boards are not synced — sign in & cloud sync first.
          </p>
        )}
      </div>
    )
  }

  return (
    <div role="radiogroup" aria-labelledby={groupId} className="space-y-1.5">
      <span id={groupId} className="sr-only">
        Choose a board to publish
      </span>
      {boards.map((board) =>
      {
        const isSelected = selected?.boardExternalId === board.boardExternalId
        return (
          <label
            key={board.boardExternalId}
            className={`focus-within:ring-2 focus-within:ring-[var(--t-accent)] flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition ${
              isSelected
                ? 'border-[var(--t-accent)] bg-[rgb(var(--t-accent)/0.06)]'
                : 'border-[var(--t-border)] bg-[var(--t-bg-surface)] hover:border-[var(--t-border-hover)]'
            }`}
          >
            <input
              type="radio"
              name="publish-board-select"
              className="h-3.5 w-3.5 accent-[var(--t-accent)]"
              checked={isSelected}
              onChange={() => onChange(board)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--t-text)]">
                {board.title}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--t-text-faint)]">
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" strokeWidth={1.8} />
                  {board.itemCount} {board.itemCount === 1 ? 'item' : 'items'}
                </span>
                <span>·</span>
                <span>created {formatRelativeTime(board.updatedAt ?? 0)}</span>
              </div>
            </div>
          </label>
        )
      })}
      {hasUnsyncedBoards && (
        <p className="px-1 pt-1 text-[10px] text-[var(--t-text-faint)]">
          Some boards aren't shown — only cloud-synced boards can be published.
        </p>
      )}
    </div>
  )
}
