// src/features/marketplace/components/discovery/CommunityConsensusSection.tsx
// toolbar + viz + rail scoped to a single criterion lane; chip selector
// renders above the section when the template has multiple criteria

import { ArrowLeftRight, Loader2, Plus } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { isTemplateRankingAggregateReady as isAggregateReady } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { RANKING_FEATURED_BADGE_LABELS } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { useCompareRanking } from '~/features/marketplace/model/detail/useCompareRanking'
import { selectBusiestOtherCriterion } from '~/features/marketplace/model/detail/criterionSelection'
import { useRemixConsensus } from '~/features/marketplace/model/remix/useRemixConsensus'
import { useRemixRanking } from '~/features/marketplace/model/remix/useRemixRanking'
import { useUseTemplate } from '~/features/marketplace/model/remix/useUseTemplate'
import {
  ACCESS_META,
  isTemplateAccessBlocked,
} from '~/features/marketplace/model/accessMeta'
import {
  useMyRankingForTemplate,
  useTemplateRankingAggregateItems,
  type TemplateRankingAggregateItemsPageStatus,
} from '~/features/marketplace/model/detail/useRankingDetail'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { SkeletonBlock } from '~/shared/ui/Skeleton'

import { BucketLegend } from '../consensus/criterion/BucketLegend'
import { ConsensusBars } from '../consensus/views/ConsensusBars'
import { ConsensusFeaturedSpotlight } from '../consensus/rail/ConsensusFeaturedSpotlight'
import { ConsensusHeatmap } from '../consensus/views/ConsensusHeatmap'
import { ConsensusRanked } from '../consensus/views/ConsensusRanked'
import { ConsensusRankingsRail } from '../consensus/rail/ConsensusRankingsRail'
import { ConsensusScatter } from '../consensus/views/ConsensusScatter'
import { ConsensusTierRows } from '../consensus/views/ConsensusTierRows'
import { ConsensusToolbar } from '../consensus/criterion/ConsensusToolbar'
import { CriterionChips } from '../consensus/criterion/CriterionChips'
import { CriterionEmptyLane } from '../consensus/criterion/CriterionEmptyLane'
import { LaneStatsCard } from '../consensus/rail/LaneStatsCard'
import { LoadingBlock } from '../consensus/views/LoadingBlock'
import {
  buildRowsForActiveRanking,
  filterAndSortActiveRankingRows,
} from '../consensus/lib/activeRankingRows'
import { ItemPopover } from '../consensus/item/ItemPopover'
import { usePopover } from '../consensus/item/usePopover'
import { templateFrame, type ConsensusVizMode } from '../consensus/lib/utils'
import { ConsensusShell } from './ConsensusShell'
import { useConsensusBodyState } from './useConsensusBodyState'
import { useConsensusRailData } from './useConsensusRailData'
import {
  useConsensusViewFrame,
  type ActiveRankingMeta,
} from './useConsensusViewFrame'

const ACTION_PILL_CLASS =
  'focus-custom flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-dashed border-[var(--t-border)] bg-transparent px-3 py-2 text-[12px] font-medium text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

interface CommunityConsensusSectionProps
{
  template: MarketplaceTemplateDetail
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
  // active criterion the section is rendering. always defined so the rest
  // of the section can speak in lane-specific copy (heading, prompt, etc.)
  selectedCriterion: MarketplaceTemplateCriterion
  // visible criteria for the chip row + empty-lane "hop to" footer; null
  // for single-criterion templates so the chip row + lane chrome suppress
  visibleCriteria: readonly MarketplaceTemplateCriterion[] | null
  onCriterionChange: (externalId: string) => void
}

interface ConsensusActionButtonsProps
{
  compareHref: string | null
  templateSlug: string
  templateTitle: string
  criterionExternalId: string
  access: MarketplaceTemplateDetail['access']
  // pinned rail rankings remix their snapshot instead of the bare template
  activeRanking: { slug: string; title: string } | null
  // true when the community lane has a generated aggregate to clone
  consensusRemixable: boolean
}

interface ConsensusPrimaryAction
{
  idleLabel: string
  run: () => void
}

const ConsensusActionButtons = ({
  compareHref,
  templateSlug,
  templateTitle,
  criterionExternalId,
  access,
  activeRanking,
  consensusRemixable,
}: ConsensusActionButtonsProps) =>
{
  const { run: runUseTemplate, isPending: isUseTemplatePending } =
    useUseTemplate()
  const { run: runRemixRanking, isPending: isRemixRankingPending } =
    useRemixRanking()
  const { run: runRemixConsensus, isPending: isRemixConsensusPending } =
    useRemixConsensus()
  const accessMeta = ACCESS_META[access]
  const accessBlocked = isTemplateAccessBlocked(access)
  const isRemixPending = isRemixRankingPending || isRemixConsensusPending
  const isPending = isUseTemplatePending || isRemixPending
  const primaryAction: ConsensusPrimaryAction = activeRanking
    ? {
        idleLabel: 'Remix this ranking',
        run: () => runRemixRanking(activeRanking.slug, activeRanking.title),
      }
    : consensusRemixable
      ? {
          idleLabel: 'Remix this ranking',
          run: () =>
            runRemixConsensus({
              templateSlug,
              templateTitle,
              criterionExternalId,
            }),
        }
      : {
          idleLabel: 'New ranking',
          run: () =>
            runUseTemplate(templateSlug, templateTitle, {
              preferredCriterionExternalId: criterionExternalId,
            }),
        }
  const label = accessBlocked
    ? accessMeta.ctaLabel
    : isRemixPending
      ? 'Remixing…'
      : isUseTemplatePending
        ? 'Forking…'
        : primaryAction.idleLabel
  return (
    <div className="flex h-full w-full gap-2">
      {compareHref && (
        <Link to={compareHref} className={ACTION_PILL_CLASS}>
          <ArrowLeftRight className="h-3 w-3" strokeWidth={2.2} />
          Compare
        </Link>
      )}
      <button
        type="button"
        onClick={primaryAction.run}
        disabled={isPending || accessBlocked}
        title={accessMeta.ctaTooltip ?? undefined}
        className={`${ACTION_PILL_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isPending && !accessBlocked ? (
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.2} />
        ) : (
          <Plus className="h-3 w-3" strokeWidth={2.4} />
        )}
        {label}
      </button>
    </div>
  )
}

const SectionSkeleton = () => (
  <div aria-hidden="true" className="space-y-3">
    <SkeletonBlock className="h-9 w-full rounded-md" tone="soft" />
    {Array.from({ length: 4 }).map((_, index) => (
      <SkeletonBlock key={index} className="h-16 rounded-md" tone="soft" />
    ))}
  </div>
)

const LoadMoreButton = ({
  status,
  onLoadMore,
}: {
  status: TemplateRankingAggregateItemsPageStatus
  onLoadMore: () => void
}) =>
{
  if (status !== 'CanLoadMore' && status !== 'LoadingMore') return null
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        disabled={status !== 'CanLoadMore'}
        onClick={onLoadMore}
        className="focus-custom inline-flex h-10 items-center gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 text-sm font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        {status === 'LoadingMore' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        )}
        {status === 'LoadingMore' ? 'Loading items…' : 'Load more items'}
      </button>
    </div>
  )
}

interface SectionHeaderProps
{
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
  showYourPlacementsCopy: boolean
  activeRanking: ActiveRankingMeta | null
  onResetActive: () => void
  selectedCriterion: MarketplaceTemplateCriterion
  // multi-criterion templates surface lane-specific copy ("Competitive
  // consensus" rather than the generic "Community consensus") so users
  // never confuse aggregate datasets across lanes
  multiCriterion: boolean
}

const SectionHeader = ({
  aggregate,
  showYourPlacementsCopy,
  activeRanking,
  onResetActive,
  selectedCriterion,
  multiCriterion,
}: SectionHeaderProps) =>
{
  const showStale = aggregate?.state === 'stale'

  if (activeRanking)
  {
    const eyebrow = activeRanking.featuredBadge
      ? `${RANKING_FEATURED_BADGE_LABELS[activeRanking.featuredBadge]} ranking`
      : 'Individual ranking'
    return (
      <div className="mb-3">
        <p
          className={`font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${
            activeRanking.featuredBadge
              ? 'text-[var(--t-warning,#facc15)]'
              : 'text-[var(--t-text-faint)]'
          }`}
        >
          {eyebrow}
        </p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--t-text)]">
          {activeRanking.title}
        </h2>
        <p className="mt-1 text-xs text-[var(--t-text-muted)]">
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
        </p>
      </div>
    )
  }

  const heading = multiCriterion
    ? `${selectedCriterion.name} consensus`
    : 'Community consensus'
  const description = multiCriterion ? selectedCriterion.prompt : null
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
          {multiCriterion ? 'Ranking by criterion' : 'The community’s verdict'}
        </p>
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

interface VizSwitchProps
{
  mode: ConsensusVizMode
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  template: MarketplaceTemplateDetail
  onOpenItem: ReturnType<typeof usePopover>['open']
  showControversy: boolean
  yourPlacements: Record<string, number> | null
}

const VizSwitch = ({
  mode,
  rows,
  buckets,
  template,
  onOpenItem,
  showControversy,
  yourPlacements,
}: VizSwitchProps) =>
{
  const frame = templateFrame(template)
  const displaySettings = template
  switch (mode)
  {
    case 'tiers':
      return (
        <ConsensusTierRows
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={displaySettings}
          onOpenItem={onOpenItem}
          yourPlacements={yourPlacements}
        />
      )
    case 'bars':
      return (
        <ConsensusBars
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={displaySettings}
          showControversy={showControversy}
          onOpenItem={onOpenItem}
        />
      )
    case 'heatmap':
      return (
        <ConsensusHeatmap
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={displaySettings}
          onOpenItem={onOpenItem}
        />
      )
    case 'scatter':
      return (
        <ConsensusScatter
          rows={rows}
          buckets={buckets}
          onOpenItem={onOpenItem}
        />
      )
    case 'ranked':
      return (
        <ConsensusRanked
          rows={rows}
          buckets={buckets}
          frame={frame}
          displaySettings={displaySettings}
          onOpenItem={onOpenItem}
        />
      )
    default:
      return null
  }
}

export const CommunityConsensusSection = ({
  template,
  aggregate,
  selectedCriterion,
  visibleCriteria,
  onCriterionChange,
}: CommunityConsensusSectionProps) =>
{
  const multiCriterion = visibleCriteria !== null
  const criterionExternalId = selectedCriterion.externalId
  const {
    activeSlug,
    railTab,
    searchQuery,
    setActiveSlug,
    setRailTab,
    setSearchQuery,
    setSort,
    setVizMode,
    sort,
    vizMode,
  } = useConsensusBodyState(criterionExternalId)

  const itemsEnabled = isAggregateReady(aggregate)
  const isActiveRanking = activeSlug !== null
  const activeGeneration = itemsEnabled ? aggregate.activeGeneration : null
  // keep the aggregate subscription warm even while a pin is active so
  // returning to the community average snaps in - no skeleton flash
  const itemsPage = useTemplateRankingAggregateItems({
    templateSlug: template.slug,
    criterionExternalId,
    generation: activeGeneration,
    sort,
    search: searchQuery.trim() || null,
    enabled: itemsEnabled,
  })

  const myRanking = useMyRankingForTemplate(
    template.slug,
    criterionExternalId,
    itemsEnabled
  )
  const yourPlacements = myRanking?.placements ?? null

  const { railResult, spotlightRanking } = useConsensusRailData({
    enabled: itemsEnabled,
    criterionExternalId,
    railTab,
    templateSlug: template.slug,
  })

  const compare = useCompareRanking({
    slug: activeSlug,
  })
  const activeBucketCount = compare.buckets?.length

  const popover = usePopover()

  const activeRows = useMemo<
    MarketplaceTemplateRankingAggregateItem[] | null
  >(() =>
  {
    if (!compare.detail || !compare.placements) return null
    if (typeof activeBucketCount !== 'number') return null
    return buildRowsForActiveRanking(
      compare.detail.items,
      compare.placements,
      activeBucketCount
    )
  }, [activeBucketCount, compare.detail, compare.placements])

  const filteredRows = useMemo<
    MarketplaceTemplateRankingAggregateItem[]
  >(() =>
  {
    if (!isActiveRanking) return itemsPage.items
    if (!activeRows || typeof activeBucketCount !== 'number') return []
    return filterAndSortActiveRankingRows(activeRows, {
      bucketCount: activeBucketCount,
      search: searchQuery,
      sort,
    })
  }, [
    activeBucketCount,
    activeRows,
    isActiveRanking,
    itemsPage.items,
    searchQuery,
    sort,
  ])
  const sourceRowCount = isActiveRanking
    ? (activeRows?.length ?? 0)
    : itemsPage.items.length

  // a non-empty placement map means we can render the overlay + the
  // headline copy that explains it. suppressed while an individual ranking
  // is active because the badges would compare your-vs-them, not your-vs-modal
  const overlayActive =
    !isActiveRanking &&
    yourPlacements !== null &&
    Object.keys(yourPlacements).length > 0

  const activeRankingMeta: ActiveRankingMeta | null = useMemo(() =>
  {
    if (!compare.detail) return null
    return {
      title: compare.detail.title,
      authorName: compare.detail.author.displayName,
      updatedAt: compare.detail.updatedAt,
      featuredBadge: compare.detail.featuredBadge,
    }
  }, [compare.detail])

  // pin-swap stability: cache the last rendered frame & keep showing it
  // (dimmed) while the next pin loads - kills the skeleton flash on swap
  const isPinLoading = isActiveRanking && compare.detail === undefined
  const isPinFailed = isActiveRanking && compare.detail === null

  const {
    cachedFrame,
    renderFrame,
    showLaneStaleFrame,
    showPinStaleFrame,
    showStaleFrame,
  } = useConsensusViewFrame({
    activeRankingMeta,
    aggregate,
    compareBuckets: compare.buckets,
    criterionExternalId,
    filteredRows,
    isActiveRanking,
    isPinFailed,
    isPinLoading,
    overlayActive,
    sort,
    templateSlug: template.slug,
    yourPlacements,
  })

  const renderBody = (): ReactNode =>
  {
    const frame = templateFrame(template)
    const displaySettings = template

    if (isPinFailed)
    {
      return (
        <EmptyCard
          title="Ranking unavailable"
          body="It may have been unpublished. Pick another ranking or return to the community average."
        />
      )
    }

    if (!renderFrame)
    {
      // pin loading w/ nothing in cache to keep showing
      if (isPinLoading) return <SectionSkeleton />
      // initial aggregate load before any items have arrived
      if (
        !isActiveRanking &&
        itemsPage.status === 'LoadingFirstPage' &&
        itemsPage.items.length === 0
      )
      {
        return <SectionSkeleton />
      }
      if (filteredRows.length === 0 && sourceRowCount === 0)
      {
        return (
          <EmptyCard
            title="No items in the consensus yet"
            body="The recompute job hasn’t projected items into this view. Check back in a bit."
          />
        )
      }
      if (filteredRows.length === 0)
      {
        return (
          <EmptyCard
            title="Nothing matches this view"
            body="Try clearing the search or changing the sort."
          />
        )
      }
      return null
    }

    return (
      <div
        className={`space-y-3 ${showStaleFrame ? 'pointer-events-none' : ''}`}
      >
        {(vizMode === 'bars' || vizMode === 'ranked') && (
          <BucketLegend buckets={renderFrame.buckets} />
        )}
        <VizSwitch
          mode={vizMode}
          rows={renderFrame.rows}
          buckets={renderFrame.buckets}
          template={template}
          onOpenItem={popover.open}
          showControversy={renderFrame.showControversy}
          yourPlacements={renderFrame.yourPlacements}
        />
        {!isActiveRanking && (
          <LoadMoreButton
            status={itemsPage.status}
            onLoadMore={() => itemsPage.loadMore()}
          />
        )}
        {popover.state && (
          <ItemPopover
            row={popover.state.row}
            buckets={renderFrame.buckets}
            anchorRect={popover.state.anchorRect}
            onClose={popover.close}
            frame={frame}
            displaySettings={displaySettings}
          />
        )}
      </div>
    )
  }

  // defensive fallback in case a stale convex client serves a pre-schema
  // template detail without the new map; memoized so downstream useMemo
  // dependency arrays stay stable across renders
  const rankingCountByCriterion = useMemo(
    () => template.rankingCountByCriterion ?? {},
    [template.rankingCountByCriterion]
  )

  const knownRankingCount =
    aggregate?.rankingCount ?? rankingCountByCriterion[criterionExternalId] ?? 0
  const knownItemCount = aggregate?.itemCount ?? template.itemCount

  const renderToolbar = (totalCount: number): ReactNode => (
    <ConsensusToolbar
      query={searchQuery}
      onQueryChange={setSearchQuery}
      sort={sort}
      onSortChange={setSort}
      vizMode={vizMode}
      onVizModeChange={setVizMode}
      totalCount={isActiveRanking ? sourceRowCount : totalCount}
      filteredCount={renderFrame?.rows.length ?? filteredRows.length}
    />
  )

  const renderLaneStats = (
    aggregateForStats: MarketplaceTemplateRankingAggregate | null | undefined,
    fallbackCount: number
  ): ReactNode => (
    <LaneStatsCard
      rankingCount={aggregateForStats?.rankingCount ?? fallbackCount}
      mostAgreed={aggregateForStats?.mostAgreed ?? null}
      mostDivisive={aggregateForStats?.mostDivisive ?? null}
      computedAt={aggregateForStats?.computedAt ?? null}
    />
  )

  const renderRail = (rankingCount: number): ReactNode =>
  {
    const railLoading =
      railResult.status === 'LoadingFirstPage' && railResult.items.length === 0
    const loadMoreEligible =
      railTab === 'all' &&
      (railResult.status === 'CanLoadMore' ||
        railResult.status === 'LoadingMore')
    const loadMoreLabel =
      railResult.status === 'LoadingMore' ? 'Loading…' : 'Load more rankings'
    return (
      <>
        {renderLaneStats(
          renderFrame?.aggregate ?? aggregate ?? null,
          rankingCount
        )}
        {spotlightRanking && (
          <ConsensusFeaturedSpotlight
            ranking={spotlightRanking}
            active={activeSlug === spotlightRanking.slug}
            onSelect={() =>
              setActiveSlug(
                activeSlug === spotlightRanking.slug
                  ? null
                  : spotlightRanking.slug
              )
            }
          />
        )}
        <ConsensusRankingsRail
          rankingCount={rankingCount}
          rankings={railResult.items}
          isLoading={railLoading}
          activeSlug={activeSlug}
          onSelect={setActiveSlug}
          tab={railTab}
          onTabChange={setRailTab}
          loadMoreEligible={loadMoreEligible}
          loadMoreLabel={loadMoreLabel}
          onLoadMore={() => railResult.loadMore()}
        />
      </>
    )
  }

  // render the rail skeleton before the first lane frame is available
  const renderRailLoading = (rankingCount: number): ReactNode => (
    <>
      {renderLaneStats(renderFrame?.aggregate ?? null, rankingCount)}
      <ConsensusRankingsRail
        rankingCount={rankingCount}
        rankings={[]}
        isLoading
        activeSlug={activeSlug}
        onSelect={setActiveSlug}
        tab={railTab}
        onTabChange={setRailTab}
        loadMoreEligible={false}
        loadMoreLabel="Loading…"
        onLoadMore={() => railResult.loadMore()}
      />
    </>
  )

  // keep compare defaults available across every aggregate state
  const compareDefaultRight = useMemo(() =>
  {
    if (!visibleCriteria) return null
    return selectBusiestOtherCriterion(
      visibleCriteria,
      criterionExternalId,
      rankingCountByCriterion
    )
  }, [criterionExternalId, rankingCountByCriterion, visibleCriteria])

  const compareHref =
    multiCriterion && compareDefaultRight
      ? `${TEMPLATES_ROUTE_PATH}/${template.slug}/compare?left=${encodeURIComponent(criterionExternalId)}&right=${encodeURIComponent(compareDefaultRight.externalId)}`
      : null
  const activeRankingForActions =
    activeSlug && compare.detail
      ? { slug: activeSlug, title: compare.detail.title }
      : null
  // keep remix CTA stable while the lane aggregate swaps criteria
  // fall back to known per-lane count until the new generation loads
  const consensusRemixable =
    aggregate === undefined
      ? knownRankingCount > 0
      : !!aggregate &&
        aggregate.rankingCount > 0 &&
        aggregate.activeGeneration !== null
  const renderConsensusActions = (): ReactNode => (
    <ConsensusActionButtons
      compareHref={compareHref}
      templateSlug={template.slug}
      templateTitle={template.title}
      criterionExternalId={criterionExternalId}
      access={template.access}
      activeRanking={activeRankingForActions}
      consensusRemixable={consensusRemixable}
    />
  )

  const chipsBlock = visibleCriteria ? (
    <CriterionChips
      criteria={visibleCriteria}
      activeExternalId={criterionExternalId}
      onChange={onCriterionChange}
      counts={rankingCountByCriterion}
      className="mb-4"
    />
  ) : null

  // body region picks the right subview for each aggregate state; the
  // chips + header stay stable across them so users don't see lane
  // navigation jumping in/out as data loads
  const renderEmptyLane = (): ReactNode =>
  {
    if (multiCriterion && visibleCriteria)
    {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <CriterionEmptyLane
              templateSlug={template.slug}
              templateTitle={template.title}
              access={template.access}
              criterion={selectedCriterion}
              otherCriteria={visibleCriteria.filter(
                (c) => c.externalId !== criterionExternalId
              )}
              rankingCountByCriterion={rankingCountByCriterion}
              onSelectCriterion={onCriterionChange}
            />
          </div>
          <aside aria-hidden="true" className="hidden lg:block" />
        </div>
      )
    }
    return (
      <EmptyCard
        title="No community consensus yet"
        body="Once people publish rankings made from this template, the spread shows up here."
      />
    )
  }

  const renderStateBody = (): React.ReactNode =>
  {
    // when switching to a lane the template manifest already says is empty,
    // skip the loading shell — otherwise the previous lane's toolbar + rail
    // flicker in for one frame before the empty state resolves
    const knownLaneCount = rankingCountByCriterion[criterionExternalId] ?? 0
    if (aggregate === undefined && knownLaneCount === 0)
    {
      return renderEmptyLane()
    }
    if (aggregate === undefined)
    {
      const laneLabel = selectedCriterion.shortName ?? selectedCriterion.name
      const totalCount = renderFrame?.aggregate.itemCount ?? knownItemCount
      const rankingCount =
        renderFrame?.aggregate.rankingCount ?? knownRankingCount
      return (
        <ConsensusShell
          toolbar={renderToolbar(totalCount)}
          body={
            renderFrame ? (
              renderBody()
            ) : (
              <LoadingBlock
                message={`Loading ${laneLabel} consensus…`}
                className="rounded-lg min-h-[28rem]"
              />
            )
          }
          rail={
            renderFrame
              ? renderRail(rankingCount)
              : renderRailLoading(rankingCount)
          }
          actions={renderConsensusActions()}
        />
      )
    }
    if (aggregate === null || aggregate.state === 'empty')
    {
      return renderEmptyLane()
    }
    if (aggregate.state === 'failed')
    {
      return (
        <EmptyCard
          title="Community consensus is unavailable"
          body="The current consensus pass could not finish. New rankings will trigger another pass."
        />
      )
    }
    if (aggregate.state === 'computing')
    {
      return (
        <LoadingBlock message="Computing consensus from public rankings…" />
      )
    }
    return (
      <ConsensusShell
        toolbar={renderToolbar(aggregate.itemCount)}
        body={renderBody()}
        rail={renderRail(aggregate.rankingCount)}
        actions={renderConsensusActions()}
      />
    )
  }

  const showYourPlacementsCopy =
    isAggregateReady(aggregate) && overlayActive && vizMode === 'tiers'

  // mid-pin-swap, keep whatever meta the cached frame had so the header
  // doesn't blip through "Community consensus" between pins
  const headerMeta = showPinStaleFrame
    ? (cachedFrame?.activeRankingMeta ?? null)
    : activeRankingMeta
  const headerAggregate =
    aggregate ?? (showLaneStaleFrame ? cachedFrame?.aggregate : undefined)

  return (
    <>
      {chipsBlock}
      <SectionHeader
        aggregate={headerAggregate}
        showYourPlacementsCopy={showYourPlacementsCopy}
        activeRanking={headerMeta}
        onResetActive={() => setActiveSlug(null)}
        selectedCriterion={selectedCriterion}
        multiCriterion={multiCriterion}
      />
      {renderStateBody()}
    </>
  )
}
