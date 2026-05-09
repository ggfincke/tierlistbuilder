// src/features/marketplace/components/consensus/CriterionChips.tsx
// pill row that swaps which criterion the consensus block answers; selected
// chip filled w/ --t-text, each lane gets an icon + accent backdrop

import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { formatCount } from '~/shared/catalog/formatters'

import { getCriterionVisual } from './criterionVisuals'

interface CriterionChipsProps
{
  // already filtered to status==='active' & sorted by order; first chip
  // controls the leftmost position so callers don't need to re-sort
  criteria: readonly MarketplaceTemplateCriterion[]
  activeExternalId: string
  onChange: (externalId: string) => void
  // public-listable ranking counts keyed by external id. undefined entries
  // render without a count (avoids showing "0" while stats are loading)
  counts?: Record<string, number>
  // dense variant fits inline w/ a toolbar row; default sits comfortably
  // above its own line of breathing room
  dense?: boolean
  className?: string
}

interface ChipProps
{
  criterion: MarketplaceTemplateCriterion
  selected: boolean
  count: number | undefined
  dense: boolean
  onClick: () => void
}

const Chip = ({ criterion, selected, count, dense, onClick }: ChipProps) =>
{
  const label = criterion.shortName ?? criterion.name
  const visual = getCriterionVisual(criterion.externalId)
  const Icon = visual.icon
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      title={criterion.prompt}
      className={`focus-custom group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
        dense ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]'
      } ${
        selected
          ? 'border-transparent bg-[var(--t-text)] text-[var(--t-bg-page)] shadow-sm'
          : 'border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)]'
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 items-center justify-center rounded-[4px]"
        style={{
          background: selected ? 'transparent' : `${visual.accent}33`,
          color: visual.accent,
        }}
      >
        <Icon className="h-3 w-3" strokeWidth={2.2} />
      </span>
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={`font-mono text-[10px] tabular-nums ${
            selected
              ? 'text-[var(--t-bg-page)]/70'
              : 'text-[var(--t-text-faint)]'
          }`}
        >
          {formatCount(count)}
        </span>
      )}
    </button>
  )
}

export const CriterionChips = ({
  criteria,
  activeExternalId,
  onChange,
  counts,
  dense = false,
  className,
}: CriterionChipsProps) =>
{
  if (criteria.length === 0) return null
  return (
    <div
      role="tablist"
      aria-label="Ranking criteria"
      className={`-mx-1 flex flex-wrap items-center gap-1.5 overflow-x-auto px-1 ${className ?? ''}`}
    >
      {criteria.map((criterion) => (
        <Chip
          key={criterion.externalId}
          criterion={criterion}
          selected={criterion.externalId === activeExternalId}
          count={counts?.[criterion.externalId]}
          dense={dense}
          onClick={() => onChange(criterion.externalId)}
        />
      ))}
    </div>
  )
}
