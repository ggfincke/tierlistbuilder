// src/features/marketplace/components/discovery/CommunityConsensusSection.tsx
// toolbar + viz + rail scoped to a single criterion lane; chip selector
// renders above the section when the template has multiple criteria

import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { isTemplateRankingAggregateReady as isAggregateReady } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  RANKING_FEATURED_BADGE_LABELS,
  DEFAULT_RANKING_LIST_LIMIT,
  type RankingFeaturedBadge,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { useCompareRanking } from '~/features/marketplace/model/useCompareRanking'
import {
  useMyRankingForTemplate,
  usePaginatedRankingsForTemplate,
  useTemplateRankingAggregateItems,
  type TemplateRankingAggregateItemsPageStatus,
} from '~/features/marketplace/model/useRankingDetail'
import {
  formatCount,
  pluralize,
  formatRelativeTime,
} from '~/shared/catalog/formatters'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { SkeletonBlock } from '~/shared/ui/Skeleton'

import { BucketLegend } from '../consensus/BucketLegend'
import { ConsensusBars } from '../consensus/ConsensusBars'
import { ConsensusFeaturedSpotlight } from '../consensus/ConsensusFeaturedSpotlight'
import { ConsensusHeatmap } from '../consensus/ConsensusHeatmap'
import { ConsensusRanked } from '../consensus/ConsensusRanked'
import {
  ConsensusRankingsRail,
  type ConsensusRailTab,
} from '../consensus/ConsensusRankingsRail'
import { ConsensusScatter } from '../consensus/ConsensusScatter'
import { ConsensusTierRows } from '../consensus/ConsensusTierRows'
import { ConsensusToolbar } from '../consensus/ConsensusToolbar'
import { CriterionChips } from '../consensus/CriterionChips'
import { CriterionEmptyLane } from '../consensus/CriterionEmptyLane'
import {
  buildRowsForActiveRanking,
  filterAndSortActiveRankingRows,
} from '../consensus/activeRankingRows'
import { ItemPopover } from '../consensus/ItemPopover'
import { usePopover } from '../consensus/usePopover'
import { templateFrame, type ConsensusVizMode } from '../consensus/utils'

const RAIL_PAGE_SIZE = DEFAULT_RANKING_LIST_LIMIT
const RAIL_SORT_BY_TAB: Record<
  ConsensusRailTab,
  'featured' | 'top' | 'recent'
> = {
  all: 'recent',
  featured: 'featured',
  top: 'top',
  recent: 'recent',
}

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

const StateCard = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-lg border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-5 py-8 text-center">
    <p className="text-sm font-semibold text-[var(--t-text)]">{title}</p>
    <p className="mt-1 text-xs text-[var(--t-text-muted)]">{body}</p>
  </div>
)

const ComputingCard = () => (
  <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-5 py-8 text-sm text-[var(--t-text-muted)]">
    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
    Computing consensus from public rankings…
  </div>
)

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

interface ActiveRankingMeta
{
  title: string
  authorName: string
  updatedAt: number
  featuredBadge: RankingFeaturedBadge | null
}

// snapshot of what the body is currently rendering. cached so a pin swap
// can keep the previous viz mounted while the new ranking detail loads
interface ViewFrame
{
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  yourPlacements: Record<string, number> | null
  showControversy: boolean
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
  // optional right-aligned slot for actions like the "Compare criteria"
  // button — rendered inside the same flex row as the heading so it
  // never wraps onto its own line on wide screens
  trailing?: ReactNode
}

const SectionHeader = ({
  aggregate,
  showYourPlacementsCopy,
  activeRanking,
  onResetActive,
  selectedCriterion,
  multiCriterion,
  trailing,
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
  const subtitleParts: string[] = []
  if (aggregate && aggregate.rankingCount > 0)
  {
    subtitleParts.push(
      `Modal tier across ${formatCount(aggregate.rankingCount)} ${pluralize(aggregate.rankingCount, 'ranking')}`
    )
    if (aggregate.computedAt)
    {
      subtitleParts.push(`Updated ${formatRelativeTime(aggregate.computedAt)}`)
    }
  }
  else
  {
    subtitleParts.push('Rankings will appear here once builders publish them')
  }
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
        {multiCriterion && (
          <p className="mt-1 text-xs text-[var(--t-text-secondary)]">
            {selectedCriterion.prompt}
          </p>
        )}
        <p
          className={`text-xs text-[var(--t-text-muted)] ${
            multiCriterion ? 'mt-0.5' : 'mt-1'
          }`}
        >
          {subtitleParts.join(' · ')}
          {showYourPlacementsCopy && (
            <>
              {' · '}
              <strong className="font-semibold text-[var(--t-accent)]">
                Your placements
              </strong>{' '}
              shown as accent badges where they differ.
            </>
          )}
        </p>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
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
  switch (mode)
  {
    case 'tiers':
      return (
        <ConsensusTierRows
          rows={rows}
          buckets={buckets}
          frame={frame}
          labelSettings={template.labels}
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
          labelSettings={template.labels}
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
          labelSettings={template.labels}
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
          labelSettings={template.labels}
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
  const [sort, setSort] =
    useState<TemplateRankingAggregateItemSort>('templateOrder')
  const [vizMode, setVizMode] = useState<ConsensusVizMode>('tiers')
  const [searchQuery, setSearchQuery] = useState('')
  // pin is stored alongside the criterion it was set in so a lane switch
  // implicitly resets the pin during render — avoids a setState-in-effect
  const [activePin, setActivePin] = useState<{
    slug: string
    criterion: string
  } | null>(null)
  const [railTab, setRailTab] = useState<ConsensusRailTab>('recent')

  const multiCriterion = visibleCriteria !== null
  const criterionExternalId = selectedCriterion.externalId
  const activeSlug =
    activePin && activePin.criterion === criterionExternalId
      ? activePin.slug
      : null
  const setActiveSlug = useCallback(
    (slug: string | null) =>
    {
      setActivePin(
        slug === null ? null : { slug, criterion: criterionExternalId }
      )
    },
    [criterionExternalId]
  )

  const itemsEnabled = isAggregateReady(aggregate)
  const isActiveRanking = activeSlug !== null
  const itemsPage = useTemplateRankingAggregateItems({
    templateSlug: template.slug,
    criterionExternalId,
    generation: aggregate?.activeGeneration,
    sort,
    search: searchQuery.trim() || null,
    enabled: itemsEnabled && !isActiveRanking,
  })

  const myRanking = useMyRankingForTemplate(
    template.slug,
    criterionExternalId,
    itemsEnabled
  )
  const yourPlacements = myRanking?.placements ?? null

  // rail data — server sort by featured/top/recent (All tab reuses recent
  // + loadMore). scoping by criterion keeps the rail in lockstep w/ viz
  const railSort = RAIL_SORT_BY_TAB[railTab]
  const railResult = usePaginatedRankingsForTemplate({
    templateSlug: itemsEnabled ? template.slug : null,
    sort: railSort,
    criterionExternalId,
    enabled: itemsEnabled,
    pageSize: RAIL_PAGE_SIZE,
  })

  // spotlight is the top featured ranking, pinned above the rail tabs
  // regardless of which tab is active so the headline pick is always visible
  const featuredHead = usePaginatedRankingsForTemplate({
    templateSlug: itemsEnabled ? template.slug : null,
    sort: 'featured',
    criterionExternalId,
    enabled: itemsEnabled,
    pageSize: 1,
  })
  const spotlightRanking = featuredHead.items[0] ?? null

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

  const currentFrame = useMemo<ViewFrame | null>(() =>
  {
    if (isPinLoading || isPinFailed) return null
    if (!aggregate || !isAggregateReady(aggregate)) return null
    if (filteredRows.length === 0) return null
    const buckets =
      isActiveRanking && compare.buckets ? compare.buckets : aggregate.buckets
    return {
      rows: filteredRows,
      buckets,
      yourPlacements: overlayActive ? yourPlacements : null,
      showControversy: sort === 'controversy' && !isActiveRanking,
    }
  }, [
    aggregate,
    compare.buckets,
    filteredRows,
    isActiveRanking,
    isPinFailed,
    isPinLoading,
    overlayActive,
    sort,
    yourPlacements,
  ])

  // scoped by criterion so a lane swap (which invalidates the aggregate)
  // never shows the wrong lane's tiers behind a load. gated render-time
  // setState is react's idiom for "store info from the previous render"
  const [frameCache, setFrameCache] = useState<{
    criterion: string
    frame: ViewFrame
  } | null>(null)
  if (currentFrame !== null && frameCache?.frame !== currentFrame)
  {
    setFrameCache({ criterion: criterionExternalId, frame: currentFrame })
  }

  const cachedFrame =
    frameCache && frameCache.criterion === criterionExternalId
      ? frameCache.frame
      : null
  // stale frame shows only mid-pin-swap; pin->aggregate & aggregate->pin
  // (cold cache) still fall through to the skeleton to avoid mismatched header
  const showStaleFrame = isPinLoading && cachedFrame !== null
  const renderFrame = currentFrame ?? (showStaleFrame ? cachedFrame : null)

  const renderBody = (): ReactNode =>
  {
    const frame = templateFrame(template)

    if (isPinFailed)
    {
      return (
        <StateCard
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
          <StateCard
            title="No items in the consensus yet"
            body="The recompute job hasn’t projected items into this view. Check back in a bit."
          />
        )
      }
      if (filteredRows.length === 0)
      {
        return (
          <StateCard
            title="Nothing matches this view"
            body="Try clearing the search or changing the sort."
          />
        )
      }
      return null
    }

    // animation key drops activeSlug so pin swaps reconcile in place
    // instead of re-keying & replaying slideUp; viz-mode/sort still animate
    const animationKey = `${vizMode}:${sort}`
    return (
      <div
        className={`space-y-3 transition-opacity duration-200 ${
          showStaleFrame ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        {(vizMode === 'bars' || vizMode === 'ranked') && (
          <BucketLegend buckets={renderFrame.buckets} />
        )}
        <div
          key={animationKey}
          style={{
            animation: 'slideUp 220ms cubic-bezier(0.2, 0, 0, 1) both',
          }}
        >
          <VizSwitch
            mode={vizMode}
            rows={renderFrame.rows}
            buckets={renderFrame.buckets}
            template={template}
            onOpenItem={popover.open}
            showControversy={renderFrame.showControversy}
            yourPlacements={renderFrame.yourPlacements}
          />
        </div>
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
            labelSettings={template.labels}
          />
        )}
      </div>
    )
  }

  const renderToolbar = (
    aggregateData: MarketplaceTemplateRankingAggregate
  ): React.ReactNode => (
    <div className="mb-3">
      <ConsensusToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        sort={sort}
        onSortChange={setSort}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        totalCount={isActiveRanking ? sourceRowCount : aggregateData.itemCount}
        filteredCount={filteredRows.length}
      />
    </div>
  )

  const renderRail = (): React.ReactNode =>
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
          rankingCount={aggregate?.rankingCount ?? 0}
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

  // defensive fallback in case a stale convex client serves a pre-schema
  // template detail without the new map; memoized so downstream useMemo
  // dependency arrays stay stable across renders
  const rankingCountByCriterion = useMemo(
    () => template.rankingCountByCriterion ?? {},
    [template.rankingCountByCriterion]
  )

  // pre-compute lane navigation so chips render uniformly across every
  // aggregate state (loading / empty / computing / failed / ready) — the
  // user can always pivot to a busier lane even when this one has no data
  const compareDefaultRight = useMemo(() =>
  {
    if (!visibleCriteria) return null
    const others = visibleCriteria.filter(
      (c) => c.externalId !== criterionExternalId
    )
    if (others.length === 0) return null
    // pick the busiest other lane as the default right side; falls back to
    // the next-by-order if no rankings exist anywhere yet
    const ranked = [...others].sort(
      (a, b) =>
        (rankingCountByCriterion[b.externalId] ?? 0) -
        (rankingCountByCriterion[a.externalId] ?? 0)
    )
    return ranked[0] ?? null
  }, [criterionExternalId, rankingCountByCriterion, visibleCriteria])

  const compareHref =
    multiCriterion && compareDefaultRight
      ? `${TEMPLATES_ROUTE_PATH}/${template.slug}/compare?left=${encodeURIComponent(criterionExternalId)}&right=${encodeURIComponent(compareDefaultRight.externalId)}`
      : null

  const chipsBlock = visibleCriteria ? (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <CriterionChips
        criteria={visibleCriteria}
        activeExternalId={criterionExternalId}
        onChange={onCriterionChange}
        counts={rankingCountByCriterion}
      />
      {compareHref && (
        <Link
          to={compareHref}
          className="focus-custom inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[var(--t-border)] bg-transparent px-3 text-[12px] font-medium text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ArrowLeftRight className="h-3 w-3" strokeWidth={2.2} />
          Compare
        </Link>
      )}
    </div>
  ) : null

  // body region picks the right subview for each aggregate state; the
  // chips + header stay stable across them so users don't see lane
  // navigation jumping in/out as data loads
  const renderStateBody = (): React.ReactNode =>
  {
    if (aggregate === undefined)
    {
      return <SectionSkeleton />
    }
    if (aggregate === null || aggregate.state === 'empty')
    {
      // empty states render the lane-aware "be the first" card on multi-
      // criterion templates so users see a real lane, not a global emptiness
      if (multiCriterion && visibleCriteria)
      {
        return (
          <CriterionEmptyLane
            templateSlug={template.slug}
            templateTitle={template.title}
            criterion={selectedCriterion}
            otherCriteria={visibleCriteria.filter(
              (c) => c.externalId !== criterionExternalId
            )}
            rankingCountByCriterion={rankingCountByCriterion}
            onSelectCriterion={onCriterionChange}
          />
        )
      }
      return (
        <StateCard
          title="No community consensus yet"
          body="Once people publish rankings made from this template, the spread shows up here."
        />
      )
    }
    if (aggregate.state === 'failed')
    {
      return (
        <StateCard
          title="Community consensus is unavailable"
          body="The current consensus pass could not finish. New rankings will trigger another pass."
        />
      )
    }
    if (aggregate.state === 'computing')
    {
      return <ComputingCard />
    }
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_auto] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {renderToolbar(aggregate)}
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {renderBody()}
        </div>
        <aside className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)]">
          {renderRail()}
        </aside>
      </div>
    )
  }

  const showYourPlacementsCopy =
    aggregate !== undefined &&
    aggregate !== null &&
    aggregate.state !== 'empty' &&
    aggregate.state !== 'failed' &&
    aggregate.state !== 'computing' &&
    overlayActive &&
    vizMode === 'tiers'

  return (
    <>
      {chipsBlock}
      <SectionHeader
        aggregate={aggregate ?? undefined}
        showYourPlacementsCopy={showYourPlacementsCopy}
        activeRanking={activeRankingMeta}
        onResetActive={() => setActiveSlug(null)}
        selectedCriterion={selectedCriterion}
        multiCriterion={multiCriterion}
      />
      {renderStateBody()}
    </>
  )
}
