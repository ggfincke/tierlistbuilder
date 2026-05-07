// src/features/marketplace/components/CommunityConsensusSection.tsx
// toolbar + viz + rail. when a ranking is picked from the rail, rows are
// re-projected from aggregate modal -> that author's exact placements

import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItem,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN,
  TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  RANKING_FEATURED_BADGE_LABELS,
  DEFAULT_RANKING_LIST_LIMIT,
  type RankingFeaturedBadge,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
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

import { BucketLegend } from './consensus/BucketLegend'
import { ConsensusBars } from './consensus/ConsensusBars'
import { ConsensusFeaturedSpotlight } from './consensus/ConsensusFeaturedSpotlight'
import { ConsensusHeatmap } from './consensus/ConsensusHeatmap'
import { ConsensusRanked } from './consensus/ConsensusRanked'
import {
  ConsensusRankingsRail,
  type ConsensusRailTab,
} from './consensus/ConsensusRankingsRail'
import { ConsensusScatter } from './consensus/ConsensusScatter'
import { ConsensusTierRows } from './consensus/ConsensusTierRows'
import { ConsensusToolbar } from './consensus/ConsensusToolbar'
import { ItemPopover } from './consensus/ItemPopover'
import { usePopover } from './consensus/usePopover'
import {
  isAggregateReady,
  templateFrame,
  type ConsensusBandFilter,
  type ConsensusVizMode,
} from './consensus/utils'

const RAIL_PAGE_SIZE = DEFAULT_RANKING_LIST_LIMIT

interface CommunityConsensusSectionProps
{
  template: MarketplaceTemplateDetail
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
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
    <div className="h-9 w-full animate-pulse rounded-md bg-[rgb(var(--t-overlay)/0.04)]" />
    {Array.from({ length: 4 }).map((_, index) => (
      <div
        key={index}
        className="h-16 animate-pulse rounded-md bg-[rgb(var(--t-overlay)/0.04)]"
      />
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

interface SectionHeaderProps
{
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
  showYourPlacementsCopy: boolean
  activeRanking: ActiveRankingMeta | null
  onResetActive: () => void
}

const SectionHeader = ({
  aggregate,
  showYourPlacementsCopy,
  activeRanking,
  onResetActive,
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
    <div className="mb-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
        The community’s verdict
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--t-text)]">
          Community consensus
        </h2>
        {showStale && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
            Recomputing
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--t-text-muted)]">
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
  )
}

interface VizSwitchProps
{
  mode: ConsensusVizMode
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  aggregate: MarketplaceTemplateRankingAggregate
  template: MarketplaceTemplateDetail
  onOpenItem: ReturnType<typeof usePopover>['open']
  showControversy: boolean
  yourPlacements: Record<string, number> | null
}

const VizSwitch = ({
  mode,
  rows,
  aggregate,
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
          buckets={aggregate.buckets}
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
          buckets={aggregate.buckets}
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
          buckets={aggregate.buckets}
          frame={frame}
          labelSettings={template.labels}
          onOpenItem={onOpenItem}
        />
      )
    case 'scatter':
      return (
        <ConsensusScatter
          rows={rows}
          buckets={aggregate.buckets}
          onOpenItem={onOpenItem}
        />
      )
    case 'ranked':
      return (
        <ConsensusRanked
          rows={rows}
          buckets={aggregate.buckets}
          frame={frame}
          labelSettings={template.labels}
          onOpenItem={onOpenItem}
        />
      )
    default:
      return null
  }
}

const buildRowsForActiveRanking = (
  rows: readonly MarketplaceTemplateRankingAggregateItem[],
  placements: Record<string, number>,
  bucketCount: number
): MarketplaceTemplateRankingAggregateItem[] =>
{
  const emptyDistribution = Array.from({ length: bucketCount }, (_, i) => ({
    bucketIndex: i,
    count: 0,
    share: 0,
  }))
  return rows.map((row) =>
  {
    const idx = placements[row.templateItemExternalId]
    if (idx === undefined)
    {
      // active author left this item unranked -> exclude from tier groups by
      // nulling topBucketIndex; tier-rows already skips null
      return {
        ...row,
        sampleCount: 0,
        topBucketIndex: null,
        topBucketShare: 0,
        consensusScore: 0,
        controversyScore: 0,
        isTopBucket: false,
        isBottomBucket: false,
        isControversial: false,
        averageBucket: null,
        distribution: emptyDistribution,
      }
    }
    const distribution = emptyDistribution.map((cell) =>
      cell.bucketIndex === idx ? { bucketIndex: idx, count: 1, share: 1 } : cell
    )
    return {
      ...row,
      sampleCount: 1,
      topBucketIndex: idx,
      topBucketShare: 1,
      consensusScore: 1,
      controversyScore: 0,
      isTopBucket: idx <= TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX,
      isBottomBucket: idx >= TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN,
      isControversial: false,
      averageBucket: idx,
      distribution,
    }
  })
}

export const CommunityConsensusSection = ({
  template,
  aggregate,
}: CommunityConsensusSectionProps) =>
{
  const [sort, setSort] =
    useState<TemplateRankingAggregateItemSort>('templateOrder')
  const [vizMode, setVizMode] = useState<ConsensusVizMode>('tiers')
  const [band, setBand] = useState<ConsensusBandFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [railTab, setRailTab] = useState<ConsensusRailTab>('recent')

  const itemsEnabled = isAggregateReady(aggregate)
  const itemsPage = useTemplateRankingAggregateItems({
    templateSlug: template.slug,
    generation: aggregate?.activeGeneration,
    sort,
    band,
    search: searchQuery.trim() || null,
    enabled: itemsEnabled,
  })

  const myRanking = useMyRankingForTemplate(template.slug, itemsEnabled)
  const yourPlacements = myRanking?.placements ?? null

  // rail data — server sort by featured / top / recent; All tab reuses recent
  // sort & surfaces the loadMore button to scroll past the first page
  const railSort =
    railTab === 'featured' ? 'featured' : railTab === 'top' ? 'top' : 'recent'
  const railResult = usePaginatedRankingsForTemplate({
    templateSlug: itemsEnabled ? template.slug : null,
    sort: railSort,
    enabled: itemsEnabled,
    pageSize: RAIL_PAGE_SIZE,
  })

  // spotlight is the top featured ranking, pinned above the rail tabs
  // regardless of which tab is active so the headline pick is always visible
  const featuredHead = usePaginatedRankingsForTemplate({
    templateSlug: itemsEnabled ? template.slug : null,
    sort: 'featured',
    enabled: itemsEnabled,
    pageSize: 1,
  })
  const spotlightRanking = featuredHead.items[0] ?? null

  const compare = useCompareRanking({
    slug: activeSlug,
    bucketCount: aggregate?.buckets.length,
  })

  const popover = usePopover()

  const projectedRows = useMemo<
    MarketplaceTemplateRankingAggregateItem[]
  >(() =>
  {
    if (!compare.placements) return itemsPage.items
    return buildRowsForActiveRanking(
      itemsPage.items,
      compare.placements,
      aggregate?.buckets.length ?? 0
    )
  }, [itemsPage.items, compare.placements, aggregate?.buckets.length])

  const filteredRows = projectedRows

  const isActiveRanking = activeSlug !== null
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

  const renderBody = (
    aggregateData: MarketplaceTemplateRankingAggregate
  ): React.ReactNode =>
  {
    const frame = templateFrame(template)

    if (
      itemsPage.status === 'LoadingFirstPage' &&
      itemsPage.items.length === 0
    )
    {
      return <SectionSkeleton />
    }

    // active-ranking detail still loading — keep the toolbar visible but
    // shimmer the body so the swap reads as a transition
    if (isActiveRanking && compare.detail === undefined)
    {
      return <SectionSkeleton />
    }

    if (filteredRows.length === 0 && itemsPage.items.length === 0)
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
          title="Nothing matches those filters"
          body="Try clearing the search or band filter to see all items."
        />
      )
    }

    const animationKey = `${activeSlug ?? 'agg'}:${vizMode}:${sort}:${band}`
    return (
      <div className="space-y-3">
        {(vizMode === 'bars' || vizMode === 'ranked') && (
          <BucketLegend buckets={aggregateData.buckets} />
        )}
        <div
          key={animationKey}
          style={{
            animation: 'slideUp 220ms cubic-bezier(0.2, 0, 0, 1) both',
          }}
        >
          <VizSwitch
            mode={vizMode}
            rows={filteredRows}
            aggregate={aggregateData}
            template={template}
            onOpenItem={popover.open}
            showControversy={sort === 'controversy' && !isActiveRanking}
            yourPlacements={overlayActive ? yourPlacements : null}
          />
        </div>
        <LoadMoreButton
          status={itemsPage.status}
          onLoadMore={() => itemsPage.loadMore()}
        />
        {popover.state && (
          <ItemPopover
            row={popover.state.row}
            buckets={aggregateData.buckets}
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
        band={band}
        onBandChange={setBand}
        sort={sort}
        onSortChange={setSort}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        totalCount={aggregateData.itemCount}
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

  if (aggregate === undefined)
  {
    return (
      <>
        <SectionHeader
          aggregate={aggregate}
          showYourPlacementsCopy={false}
          activeRanking={null}
          onResetActive={() => setActiveSlug(null)}
        />
        <SectionSkeleton />
      </>
    )
  }
  if (aggregate === null || aggregate.state === 'empty')
  {
    return (
      <>
        <SectionHeader
          aggregate={aggregate}
          showYourPlacementsCopy={false}
          activeRanking={null}
          onResetActive={() => setActiveSlug(null)}
        />
        <StateCard
          title="No community consensus yet"
          body="Once people publish rankings made from this template, the spread shows up here."
        />
      </>
    )
  }
  if (aggregate.state === 'computing')
  {
    return (
      <>
        <SectionHeader
          aggregate={aggregate}
          showYourPlacementsCopy={false}
          activeRanking={null}
          onResetActive={() => setActiveSlug(null)}
        />
        <ComputingCard />
      </>
    )
  }

  return (
    <>
      <SectionHeader
        aggregate={aggregate}
        showYourPlacementsCopy={overlayActive && vizMode === 'tiers'}
        activeRanking={activeRankingMeta}
        onResetActive={() => setActiveSlug(null)}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_auto] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {renderToolbar(aggregate)}
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {renderBody(aggregate)}
        </div>
        <aside className="flex flex-col gap-3 lg:col-start-2 lg:row-start-2 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)]">
          {renderRail()}
        </aside>
      </div>
    </>
  )
}
