// src/components/comparison/ComparisonModal.tsx
// comparison modal — side-by-side board view w/ optional diff overlay

import { useId, useMemo, useState } from 'react'

import type { BoardId, PaletteId, TierListData } from '../../types'
import { computeBoardDiff, type BoardDiff } from '../../domain/boardDiff'
import { useComparisonMode } from '../../hooks/useComparisonMode'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { BaseModal } from '../ui/BaseModal'
import { SecondaryButton } from '../ui/SecondaryButton'
import { ComparisonBoardSelector } from './ComparisonBoardSelector'
import { DiffSummary } from './DiffSummary'
import { ReadOnlyBoard, type DiffHighlight } from './ReadOnlyBoard'

// build diff highlight maps for both boards from a computed diff
const buildDiffHighlights = (
  diff: BoardDiff,
  leftData: TierListData,
  rightData: TierListData
): { left: Map<string, DiffHighlight>; right: Map<string, DiffHighlight> } =>
{
  const left = new Map<string, DiffHighlight>()
  const right = new Map<string, DiffHighlight>()

  for (const entry of diff.entries)
  {
    if (entry.change === 'promoted')
    {
      left.set(entry.itemIdA, 'demoted')
      right.set(entry.itemIdB, 'promoted')
    }
    else if (entry.change === 'demoted')
    {
      left.set(entry.itemIdA, 'promoted')
      right.set(entry.itemIdB, 'demoted')
    }
  }

  for (const id of diff.removedFromB)
  {
    if (leftData.items[id]) left.set(id, 'removed')
  }

  for (const id of diff.addedToB)
  {
    if (rightData.items[id]) right.set(id, 'added')
  }

  return { left, right }
}

interface ComparisonModalProps
{
  open: boolean
  onClose: () => void
}

export const ComparisonModal = ({ open, onClose }: ComparisonModalProps) =>
{
  const titleId = useId()
  const paletteId: PaletteId = useCurrentPaletteId()
  const [showDiff, setShowDiff] = useState(false)

  const {
    boards,
    leftId,
    rightId,
    leftData,
    rightData,
    setLeftBoard,
    setRightBoard,
  } = useComparisonMode(open)

  // compute diff when enabled (memoized to avoid recomputation on unrelated renders)
  const { diff, leftHighlights, rightHighlights } = useMemo(() =>
  {
    if (!showDiff || !leftData || !rightData)
    {
      return {
        diff: null,
        leftHighlights: undefined,
        rightHighlights: undefined,
      }
    }
    const d = computeBoardDiff(leftData, rightData)
    const h = buildDiffHighlights(d, leftData, rightData)
    return {
      diff: d,
      leftHighlights: h.left,
      rightHighlights: h.right,
    }
  }, [showDiff, leftData, rightData])

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex h-[min(90vh,56rem)] w-full max-w-6xl flex-col p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
          Compare Boards
        </h2>
        <div className="flex items-center gap-2">
          <SecondaryButton
            size="sm"
            variant={showDiff ? 'surface' : undefined}
            onClick={() => setShowDiff(!showDiff)}
            className={showDiff ? 'ring-1 ring-[var(--t-accent)]' : ''}
          >
            {showDiff ? 'Hide Diff' : 'Show Diff'}
          </SecondaryButton>
          <SecondaryButton size="sm" onClick={onClose}>
            Done
          </SecondaryButton>
        </div>
      </div>

      {/* board selectors */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ComparisonBoardSelector
          boards={boards}
          selectedId={leftId as BoardId}
          onChange={setLeftBoard}
          label="Left"
        />
        <ComparisonBoardSelector
          boards={boards}
          selectedId={rightId as BoardId}
          onChange={setRightBoard}
          label="Right"
        />
      </div>

      {/* diff summary */}
      {showDiff && diff && <DiffSummary diff={diff} />}

      {/* side-by-side boards */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
        <div className="min-h-0 overflow-y-auto rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
          {leftData ? (
            <ReadOnlyBoard
              data={leftData}
              paletteId={paletteId}
              diffHighlights={leftHighlights}
            />
          ) : (
            <p className="p-4 text-center text-sm text-[var(--t-text-muted)]">
              Select a board
            </p>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
          {rightData ? (
            <ReadOnlyBoard
              data={rightData}
              paletteId={paletteId}
              diffHighlights={rightHighlights}
            />
          ) : (
            <p className="p-4 text-center text-sm text-[var(--t-text-muted)]">
              Select a board
            </p>
          )}
        </div>
      </div>
    </BaseModal>
  )
}
