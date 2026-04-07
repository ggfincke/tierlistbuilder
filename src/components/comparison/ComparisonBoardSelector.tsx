// src/components/comparison/ComparisonBoardSelector.tsx
// dropdown to select a board for comparison view

import { memo } from 'react'

import type { BoardId, BoardMeta } from '../../types'

interface ComparisonBoardSelectorProps
{
  boards: BoardMeta[]
  selectedId: BoardId | ''
  onChange: (boardId: BoardId) => void
  label: string
}

export const ComparisonBoardSelector = memo(
  ({ boards, selectedId, onChange, label }: ComparisonBoardSelectorProps) => (
    <div className="flex items-center gap-2">
      <label className="shrink-0 text-xs font-medium text-[var(--t-text-muted)]">
        {label}
      </label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value as BoardId)}
        className="min-w-0 flex-1 truncate rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-2 py-1.5 text-sm text-[var(--t-text)] focus:outline-none focus:ring-1 focus:ring-[var(--t-accent)]"
      >
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.title}
          </option>
        ))}
      </select>
    </div>
  )
)
