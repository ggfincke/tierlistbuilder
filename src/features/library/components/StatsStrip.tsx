// src/features/library/components/StatsStrip.tsx
// 4-column stats bar — Lists / In progress / Finished / Published

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'

import { pluralize } from '~/features/marketplace/model/formatters'

interface StatsStripProps
{
  boards: readonly LibraryBoardListItem[]
}

interface StatColProps
{
  label: string
  value: number | string
  subtitle?: string
  isFirst?: boolean
}

const StatCol = ({ label, value, subtitle, isFirst }: StatColProps) => (
  <div
    className="flex flex-col gap-1 px-5 py-3.5"
    style={isFirst ? undefined : { borderLeft: '1px solid var(--t-border)' }}
  >
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
      {label}
    </div>
    <div className="text-[22px] font-semibold tracking-tight tabular-nums text-[var(--t-text)]">
      {value}
    </div>
    {subtitle && (
      <div className="text-[10px] text-[var(--t-text-muted)]">{subtitle}</div>
    )}
  </div>
)

export const StatsStrip = ({ boards }: StatsStripProps) =>
{
  const totals = {
    total: boards.length,
    drafts: 0,
    inProgress: 0,
    finished: 0,
    published: 0,
  }
  for (const board of boards)
  {
    if (board.status === 'draft') totals.drafts += 1
    else if (board.status === 'in_progress') totals.inProgress += 1
    else if (board.status === 'finished') totals.finished += 1
    else if (board.status === 'published') totals.published += 1
  }

  return (
    <div
      className="grid overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-sunken)]"
      style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
    >
      <StatCol
        isFirst
        label="Lists"
        value={totals.total}
        subtitle={`${totals.drafts} ${pluralize(totals.drafts, 'draft')} · ${totals.inProgress} active`}
      />
      <StatCol
        label="In progress"
        value={totals.inProgress}
        subtitle={
          totals.inProgress === 1
            ? 'currently ranking'
            : 'currently ranking lists'
        }
      />
      <StatCol
        label="Finished"
        value={totals.finished}
        subtitle={totals.finished === 1 ? 'ready to share' : 'ready to share'}
      />
      <StatCol
        label="Published"
        value={totals.published}
        subtitle={
          totals.published === 1 ? 'live as a template' : 'live as templates'
        }
      />
    </div>
  )
}
