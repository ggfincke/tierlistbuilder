// src/features/library/components/StatsStrip.tsx
// 4-column stats bar — Lists / In progress / Finished / Published

import type { LibraryStatusCounts } from '~/features/library/lib/sortAndFilter'
import { pluralize } from '~/shared/catalog/formatters'

interface StatsStripProps
{
  counts: LibraryStatusCounts
  totalBoards: number
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
    className={`flex flex-col gap-1 px-5 py-3.5 ${isFirst ? '' : 'border-l border-[var(--t-border)]'}`}
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

export const StatsStrip = ({ counts, totalBoards }: StatsStripProps) => (
  <div
    className="grid overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-sunken)]"
    style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
  >
    <StatCol
      isFirst
      label="Lists"
      value={totalBoards}
      subtitle={`${counts.draft} ${pluralize(counts.draft, 'draft')} · ${counts.in_progress} active`}
    />
    <StatCol
      label="In progress"
      value={counts.in_progress}
      subtitle="currently ranking"
    />
    <StatCol
      label="Finished"
      value={counts.finished}
      subtitle="ready to share"
    />
    <StatCol
      label="Published"
      value={counts.published}
      subtitle={`live as ${pluralize(counts.published, 'a template', 'templates')}`}
    />
  </div>
)
