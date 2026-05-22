// src/features/marketplace/ui/consensus/compare/CompareLaneHeader.tsx
// per-lane header card: criterion identity, swap dropdown, lane stats —
// gives readers context before they hit the downstream viz blocks

import { ChevronsUpDown, Tag } from 'lucide-react'
import { useId } from 'react'

import type { MarketplaceTemplateRankingAggregate } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { formatCount } from '~/shared/catalog/formatters'

import { LEFT_LANE_TONE, RIGHT_LANE_TONE } from './laneUtils'
import { CompareCard } from './CompareCard'

export type CompareLaneSide = 'left' | 'right'

interface CompareLaneHeaderProps
{
  side: CompareLaneSide
  criterion: MarketplaceTemplateCriterion
  // every active criterion on the source template; used to populate the
  // swap dropdown. callers pass the active filtered list so we don't have
  // to re-derive status filtering here
  selectableCriteria: readonly MarketplaceTemplateCriterion[]
  // criterion selected on the *other* side; we filter it out of the
  // dropdown so users can't compare a lane against itself
  otherSideExternalId: string
  onSelect: (externalId: string) => void
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
}

// stable per-side accent: left == --t-accent, right == --t-success.
// applied only to the inline label & tag glyph so the card chrome stays
// neutral; lane identity reads from the chip + icon, not the card edge
const SIDE_TONE: Record<CompareLaneSide, { color: string; label: string }> = {
  left: { color: LEFT_LANE_TONE, label: 'Lane A' },
  right: { color: RIGHT_LANE_TONE, label: 'Lane B' },
}

const AGGREGATE_STATE_LABELS: Record<
  NonNullable<MarketplaceTemplateRankingAggregate['state']>,
  string
> = {
  computing: 'Computing',
  stale: 'Recomputing',
  failed: 'Failed',
  empty: 'Empty',
  ready: 'Ready',
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-2 py-1.5">
    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
      {label}
    </p>
    <p className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-[var(--t-text)]">
      {value}
    </p>
  </div>
)

export const CompareLaneHeader = ({
  side,
  criterion,
  selectableCriteria,
  otherSideExternalId,
  onSelect,
  aggregate,
}: CompareLaneHeaderProps) =>
{
  const tone = SIDE_TONE[side]
  const selectId = useId()
  const choices = selectableCriteria.filter(
    (c) => c.externalId !== otherSideExternalId
  )
  const rankingCount = aggregate?.rankingCount ?? 0
  // the derived stats need a ready aggregate; while loading we bias toward
  // a zeroed display rather than showing stale numbers that contradict the
  // viz blocks we're about to render
  const itemCount = aggregate?.itemCount ?? 0
  const aggregateState = aggregate?.state ?? null
  const stateLabel = aggregateState
    ? AGGREGATE_STATE_LABELS[aggregateState]
    : '—'

  return (
    <CompareCard padding="sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)]"
          style={{ color: tone.color }}
        >
          <Tag className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: tone.color }}
          >
            {tone.label}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-[var(--t-text)]">
            {criterion.name}
          </p>
          {criterion.prompt && (
            <p className="mt-0.5 truncate text-[11px] text-[var(--t-text-muted)]">
              {criterion.prompt}
            </p>
          )}
        </div>
        <label
          htmlFor={selectId}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] pl-2 pr-1 text-[12px] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)]"
        >
          <span className="sr-only">Switch criterion</span>
          <select
            id={selectId}
            value={criterion.externalId}
            onChange={(event) => onSelect(event.target.value)}
            className="focus-custom h-8 cursor-pointer appearance-none bg-transparent pr-5 text-[12px] font-medium text-[var(--t-text)] focus:outline-none"
          >
            {choices.map((c) => (
              <option key={c.externalId} value={c.externalId}>
                {c.shortName ?? c.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown
            className="-ml-4 h-3 w-3 shrink-0 text-[var(--t-text-faint)]"
            strokeWidth={2}
          />
        </label>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Stat label="Rankings" value={formatCount(rankingCount)} />
        <Stat label="Items" value={String(itemCount)} />
        <Stat label="State" value={stateLabel} />
      </div>
    </CompareCard>
  )
}
