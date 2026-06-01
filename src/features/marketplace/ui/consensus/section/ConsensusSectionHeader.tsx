// src/features/marketplace/ui/consensus/section/ConsensusSectionHeader.tsx
// lane heading for community & pinned-ranking states

import { RANKING_FEATURED_BADGE_LABELS } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateRankingAggregate } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { CompareSectionHeading } from '../compare/CompareSectionHeading'
import { SectionEyebrow } from '../SectionEyebrow'
import type { ActiveRankingMeta } from './useConsensusViewFrame'

interface ConsensusSectionHeaderProps
{
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
  showYourPlacementsCopy: boolean
  activeRanking: ActiveRankingMeta | null
  onResetActive: () => void
  selectedCriterion: MarketplaceTemplateCriterion
  multiCriterion: boolean
}

export const ConsensusSectionHeader = ({
  aggregate,
  showYourPlacementsCopy,
  activeRanking,
  onResetActive,
  selectedCriterion,
  multiCriterion,
}: ConsensusSectionHeaderProps) =>
{
  const showStale = aggregate?.state === 'stale'

  if (activeRanking)
  {
    const eyebrow = activeRanking.featuredBadge
      ? `${RANKING_FEATURED_BADGE_LABELS[activeRanking.featuredBadge]} ranking`
      : 'Individual ranking'
    return (
      <CompareSectionHeading
        eyebrow={eyebrow}
        eyebrowTone={activeRanking.featuredBadge ? 'warning' : 'faint'}
        title={activeRanking.title}
        body={
          <>
            Viewing one ranking — by {activeRanking.authorName},{' '}
            {formatRelativeTime(activeRanking.updatedAt)}.{' '}
            <button
              type="button"
              onClick={onResetActive}
              className="focus-custom rounded text-[var(--t-accent)] transition hover:text-[var(--t-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              Back to community average
            </button>
            .
          </>
        }
      />
    )
  }

  const heading = multiCriterion
    ? `${selectedCriterion.name} consensus`
    : 'Community consensus'
  const description = multiCriterion ? selectedCriterion.prompt : null
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <SectionEyebrow>
          {multiCriterion ? 'Ranking by criterion' : 'The community’s verdict'}
        </SectionEyebrow>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--t-text)]">
            {heading}
          </h2>
          {showStale && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
              Recomputing
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs text-[var(--t-text-secondary)]">
            {description}
          </p>
        )}
        {showYourPlacementsCopy && (
          <p className="mt-1 text-xs text-[var(--t-text-muted)]">
            <strong className="font-semibold text-[var(--t-accent)]">
              Your placements
            </strong>{' '}
            shown as accent badges where they differ.
          </p>
        )}
      </div>
    </div>
  )
}
