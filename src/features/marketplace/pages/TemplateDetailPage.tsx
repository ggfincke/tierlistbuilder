// src/features/marketplace/pages/TemplateDetailPage.tsx
// breadcrumb -> hero -> consensus (w/ inline rail) -> credit -> related

import { Layers } from 'lucide-react'
import { useMemo } from 'react'

import {
  isTemplateSlug,
  type MarketplaceTemplateDetail,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  isTemplateRankingAggregateReady as isAggregateReady,
  type MarketplaceTemplateRankingAggregate,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { useSelectedCriterion } from '~/features/marketplace/model/useSelectedCriterion'
import { useTemplateBySlug } from '~/features/marketplace/model/useTemplateDetail'
import { useValidatedSlug } from '~/features/marketplace/model/useValidatedSlug'
import { useRelatedTemplates } from '~/features/marketplace/model/useTemplateDetail'
import { useTemplateRankingAggregate } from '~/features/marketplace/model/useRankingDetail'
import { useRecordTemplateView } from '~/features/marketplace/model/useRecordTemplateView'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { SkeletonBlock, SkeletonCard, SkeletonText } from '~/shared/ui/Skeleton'

import { Card } from '~/features/marketplace/components/cards/Card'
import { CommunityConsensusSection } from '~/features/marketplace/components/discovery/CommunityConsensusSection'
import {
  HeroRailCards,
  HeroRailCardsLoading,
} from '~/features/marketplace/components/consensus/HeroRailCards'
import { useHeroSpread } from '~/features/marketplace/components/consensus/useHeroSpread'
import { templateFrame } from '~/features/marketplace/components/consensus/utils'
import { RailHeader } from '~/features/marketplace/components/discovery/RailHeader'
import { RecommendedPresetCard } from '~/features/marketplace/components/cards/RecommendedPresetCard'
import {
  RESERVED_RAIL,
  TemplateHero,
} from '~/features/marketplace/components/template/TemplateHero'
import { MarketplaceNotFound } from '~/features/marketplace/components/layout/MarketplaceNotFound'
import { MarketplaceBreadcrumb } from '~/features/marketplace/components/layout/MarketplaceBreadcrumb'

const RELATED_LIMIT = 4
const HERO_AGGREGATE_CACHE = new Map<
  string,
  MarketplaceTemplateRankingAggregate
>()

const NotFound = () => (
  <MarketplaceNotFound
    title="Template not found"
    body="It may have been unpublished or the link might be wrong."
    actionLabel="Back to gallery"
    to={TEMPLATES_ROUTE_PATH}
  />
)

const DetailSkeleton = () => (
  <section
    aria-hidden="true"
    className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24"
  >
    <SkeletonText className="w-48" tone="soft" />
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.25fr_0.95fr_320px]">
      <SkeletonBlock className="h-72 rounded-lg sm:h-80 lg:h-[32rem]" />
      <div className="space-y-4">
        <SkeletonText className="w-32" tone="soft" />
        <SkeletonBlock className="h-9 w-3/4 rounded" tone="strong" />
        <SkeletonText className="w-2/3" tone="soft" />
        <SkeletonBlock className="h-11 rounded-md" />
      </div>
      <div className="hidden flex-col gap-3 lg:flex">
        <SkeletonBlock className="h-24 rounded-xl" tone="soft" />
        <SkeletonBlock className="h-36 rounded-xl" tone="soft" />
        <SkeletonBlock className="h-32 rounded-xl" tone="soft" />
      </div>
    </div>
    <SkeletonBlock className="mt-12 h-9 rounded-md" tone="soft" />
    <SkeletonBlock className="mt-3 h-64 rounded-xl" tone="soft" />
  </section>
)

const RelatedTemplatesRail = ({
  slug,
  categoryLabel,
}: {
  slug: string
  categoryLabel: string
}) =>
{
  const result = useRelatedTemplates({ slug, limit: RELATED_LIMIT })
  if (result === undefined)
  {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: RELATED_LIMIT }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    )
  }
  if (result.items.length === 0)
  {
    return (
      <EmptyCard
        radius="md"
        padding="sm"
        body={`Nothing else in ${categoryLabel} yet — check back as the gallery grows.`}
      />
    )
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {result.items.map((tpl) => (
        <Card key={tpl.slug} template={tpl} size="default" />
      ))}
    </div>
  )
}

interface CreditNoteProps
{
  template: MarketplaceTemplateDetail
}

const CreditNote = ({ template }: CreditNoteProps) =>
{
  const credit = template.creditLine
  if (!credit) return null
  return (
    <section className="mt-8">
      <p className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4 text-xs leading-relaxed text-[var(--t-text-muted)]">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
          Credit
        </span>
        <span className="mt-1.5 block">{credit}</span>
      </p>
    </section>
  )
}

export const TemplateDetailPage = () =>
{
  const validSlug = useValidatedSlug(isTemplateSlug)
  const detail = useTemplateBySlug(validSlug)
  // only record once we have a valid published row; null/undefined skip
  useRecordTemplateView(detail ? detail.slug : null)
  useDocumentTitle(detail ? `${detail.title} · TierListBuilder` : null)

  if (validSlug === null) return <NotFound />
  if (detail === undefined) return <DetailSkeleton />
  if (detail === null) return <NotFound />

  return <TemplateDetailContent detail={detail} />
}

interface TemplateDetailContentProps
{
  detail: MarketplaceTemplateDetail
}

const useCachedHeroAggregate = (
  cacheKey: string,
  readyAggregate: MarketplaceTemplateRankingAggregate | null,
  useFallback: boolean
): MarketplaceTemplateRankingAggregate | null =>
{
  const cachedAggregate = HERO_AGGREGATE_CACHE.get(cacheKey) ?? null
  if (
    readyAggregate !== null &&
    !isSameHeroAggregate(cachedAggregate, readyAggregate)
  )
  {
    HERO_AGGREGATE_CACHE.set(cacheKey, readyAggregate)
  }

  return readyAggregate ?? (useFallback ? cachedAggregate : null)
}

const isSameHeroAggregate = (
  previous: MarketplaceTemplateRankingAggregate | null,
  next: MarketplaceTemplateRankingAggregate
): boolean =>
{
  if (previous === null) return false
  return (
    previous.criterion.externalId === next.criterion.externalId &&
    previous.state === next.state &&
    previous.activeGeneration === next.activeGeneration &&
    previous.rankingCount === next.rankingCount &&
    previous.itemCount === next.itemCount &&
    previous.computedAt === next.computedAt &&
    previous.staleAt === next.staleAt
  )
}

// inner component so the criterion-aware hooks below only mount once we
// have a resolved template — `useSelectedCriterion` needs the criteria
// list at call time, & we don't want to pass an empty placeholder
const TemplateDetailContent = ({ detail }: TemplateDetailContentProps) =>
{
  const { criterion, visibleCriteria, setCriterion } = useSelectedCriterion(
    detail.criteria
  )
  const aggregate = useTemplateRankingAggregate(
    detail.slug,
    criterion.externalId
  )
  const rankingCount =
    aggregate?.rankingCount ??
    detail.rankingCountByCriterion?.[criterion.externalId] ??
    0
  const readyAggregate = isAggregateReady(aggregate) ? aggregate : null
  const heroAggregate = useCachedHeroAggregate(
    `${detail.slug}:${criterion.externalId}`,
    readyAggregate,
    aggregate === undefined
  )
  const heroAggregateLoading =
    aggregate === undefined && heroAggregate === null && rankingCount > 0
  const spreadCounts = useHeroSpread({ aggregate: heroAggregate })

  const categoryLabel = CATEGORY_META[detail.category].label
  const hasConsensus = readyAggregate !== null || rankingCount > 0
  // hero counts now reflect the active lane so users see the same number
  // they'd see in the consensus header instead of an aggregated count
  // that may not match what the chart below is showing
  const frame = templateFrame(detail)
  const hasPreset = detail.suggestedTiers.length > 0
  // template-level "any lane has rankings" — used to keep the hero grid stable
  // when the user clicks between lanes; otherwise the cover/meta widths shift
  // every time the current lane happens to have no consensus content
  const templateHasAnyRankings = useMemo(
    () =>
      Object.values(detail.rankingCountByCriterion ?? {}).some(
        (count) => count > 0
      ),
    [detail.rankingCountByCriterion]
  )
  const showRail = hasPreset || heroAggregate !== null || heroAggregateLoading
  // when the current lane has no rail content but another lane on this
  // template does, pass the RESERVED_RAIL sentinel so the hero keeps the
  // 320px placeholder column & widths don't jump on lane switches
  const reserveRailColumn = templateHasAnyRankings && !showRail
  const heroConsensusRail =
    heroAggregate !== null || heroAggregateLoading ? (
      <div className={`flex flex-col gap-3 ${hasPreset ? 'lg:mt-auto' : ''}`}>
        {heroAggregate !== null ? (
          <HeroRailCards
            templateSlug={detail.slug}
            aggregate={heroAggregate}
            frame={frame}
            labelSettings={detail.labels}
          />
        ) : (
          <HeroRailCardsLoading rankingCount={rankingCount} />
        )}
      </div>
    ) : null

  return (
    <article className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24">
      <MarketplaceBreadcrumb
        items={[
          { label: 'Templates', to: TEMPLATES_ROUTE_PATH },
          { label: categoryLabel },
          { label: detail.title },
        ]}
      />

      <div className="mt-5">
        <TemplateHero
          template={detail}
          hasConsensus={hasConsensus}
          rankingCount={rankingCount}
          spreadCounts={spreadCounts ?? undefined}
          rightRail={
            showRail ? (
              <>
                {hasPreset && (
                  <RecommendedPresetCard tiers={detail.suggestedTiers} />
                )}
                {heroConsensusRail}
              </>
            ) : reserveRailColumn ? (
              RESERVED_RAIL
            ) : null
          }
        />
      </div>

      <section className="mt-12">
        <CommunityConsensusSection
          key={detail.slug}
          template={detail}
          aggregate={aggregate}
          selectedCriterion={criterion}
          visibleCriteria={visibleCriteria}
          onCriterionChange={setCriterion}
        />
      </section>

      <CreditNote template={detail} />

      <section className="mt-12">
        <RailHeader
          title="Related templates"
          subtitle={`More from ${categoryLabel}`}
          icon={Layers}
        />
        <RelatedTemplatesRail
          slug={detail.slug}
          categoryLabel={categoryLabel}
        />
      </section>
    </article>
  )
}
