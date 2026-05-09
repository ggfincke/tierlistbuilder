// src/features/marketplace/components/consensus/CriterionEmptyLane.tsx
// per-lane empty state on multi-criterion templates: pitches "publish via
// UseTemplate" or hop to a busier lane so the user knows the lane works

import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react'

import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { UseTemplateButton } from '../cards/UseTemplateButton'

interface CriterionEmptyLaneProps
{
  templateSlug: string
  templateTitle: string
  // the lane we're showing as empty; copy speaks in this criterion's voice
  // so the user gets a meaningful "be the first to answer X" pitch
  criterion: MarketplaceTemplateCriterion
  // every other active criterion on the template; rendered as quick-jump
  // links so users don't get stuck on a thin lane when a busier one exists
  otherCriteria: readonly MarketplaceTemplateCriterion[]
  // counts may be undefined while a stale convex client serves a pre-
  // schema response; default to {} so the component never crashes
  rankingCountByCriterion?: Record<string, number>
  onSelectCriterion: (externalId: string) => void
}

export const CriterionEmptyLane = ({
  templateSlug,
  templateTitle,
  criterion,
  otherCriteria,
  rankingCountByCriterion,
  onSelectCriterion,
}: CriterionEmptyLaneProps) =>
{
  const shortName = criterion.shortName ?? criterion.name
  const counts = rankingCountByCriterion ?? {}
  return (
    <div className="overflow-hidden rounded-xl border border-dashed border-[var(--t-border)] bg-[var(--t-bg-surface)]">
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg-sunken)] text-[var(--t-text-secondary)]"
        >
          <Sparkles className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="max-w-md">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            No consensus yet for this lane
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--t-text)]">
            Be the first to answer “{shortName.toLowerCase()}”
          </h3>
          <p className="mt-1 text-sm text-[var(--t-text-muted)]">
            {criterion.prompt} Once a few people publish rankings here, this
            empties out into a real community consensus.
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <UseTemplateButton
            slug={templateSlug}
            templateTitle={templateTitle}
            size="md"
          />
        </div>
      </div>
      {otherCriteria.length > 0 && (
        <div className="border-t border-[var(--t-border)] bg-[var(--t-bg-sunken)]/60 px-4 py-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
            Or hop to a busier lane
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {otherCriteria.map((other) =>
            {
              const count = counts[other.externalId] ?? 0
              const otherShortName = other.shortName ?? other.name
              return (
                <li key={other.externalId}>
                  <button
                    type="button"
                    onClick={() => onSelectCriterion(other.externalId)}
                    className="focus-custom flex w-full items-center gap-2.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2.5 py-2 text-left transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                  >
                    <ArrowRight
                      className="h-3 w-3 shrink-0 text-[var(--t-text-faint)]"
                      strokeWidth={2}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-[var(--t-text)]">
                        {otherShortName}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--t-text-muted)]">
                        {count} {count === 1 ? 'ranking' : 'rankings'}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-3 w-3 shrink-0 text-[var(--t-text-faint)]"
                      strokeWidth={2}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
