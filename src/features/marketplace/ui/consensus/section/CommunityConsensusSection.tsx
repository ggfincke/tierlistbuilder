// src/features/marketplace/ui/consensus/section/CommunityConsensusSection.tsx
// toolbar + viz + rail scoped to a single criterion lane; chip selector
// renders above the section when the template has multiple criteria

import { useMemo, type ReactNode } from 'react'

import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { isTemplateRankingAggregateReady as isAggregateReady } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { useCompareRanking } from '~/features/marketplace/model/detail/useCompareRanking'
import { selectBusiestOtherCriterion } from '~/features/marketplace/model/detail/criterionSelection'
import {
  useMyRankingForTemplate,
  useTemplateRankingAggregateItems,
} from '~/features/marketplace/model/detail/useRankingDetail'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { EmptyCard } from '~/shared/ui/EmptyCard'

import { BucketLegend } from '../criterion/BucketLegend'
import { CriterionChips } from '../criterion/CriterionChips'
import { CriterionEmptyLane } from '../criterion/CriterionEmptyLane'
import { LoadingBlock } from '../views/LoadingBlock'
import {
  buildRowsForActiveRanking,
  filterAndSortActiveRankingRows,
} from '../lib/activeRankingRows'
import { ItemPopover } from '../item/ItemPopover'
import { usePopover } from '../item/usePopover'
import { templateFrame } from '../lib/utils'
import { ConsensusActionButtons } from './ConsensusActionButtons'
import { ConsensusSectionHeader } from './ConsensusSectionHeader'
import {
  ConsensusRailSlot,
  ConsensusToolbarSlot,
  LoadMoreButton,
  SectionSkeleton,
} from './ConsensusSectionSlots'
import { ConsensusShell } from './ConsensusShell'
import { ConsensusVizSwitch } from './ConsensusVizSwitch'
import { useConsensusBodyState } from './useConsensusBodyState'
import { useConsensusRailData } from './useConsensusRailData'
import {
  useConsensusViewFrame,
  type ActiveRankingMeta,
} from './useConsensusViewFrame'

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
        <ConsensusVizSwitch
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
            displaySettings={template}
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
  const toolbarFilteredCount = renderFrame?.rows.length ?? filteredRows.length

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
          toolbar={
            <ConsensusToolbarSlot
              query={searchQuery}
              onQueryChange={setSearchQuery}
              sort={sort}
              onSortChange={setSort}
              vizMode={vizMode}
              onVizModeChange={setVizMode}
              totalCount={totalCount}
              isActiveRanking={isActiveRanking}
              sourceRowCount={sourceRowCount}
              filteredCount={toolbarFilteredCount}
            />
          }
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
            <ConsensusRailSlot
              rankingCount={rankingCount}
              aggregateForStats={renderFrame?.aggregate ?? null}
              spotlightRanking={spotlightRanking}
              activeSlug={activeSlug}
              onSelectRanking={setActiveSlug}
              railResult={railResult}
              railTab={railTab}
              onRailTabChange={setRailTab}
              forceLoading={!renderFrame}
            />
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
        toolbar={
          <ConsensusToolbarSlot
            query={searchQuery}
            onQueryChange={setSearchQuery}
            sort={sort}
            onSortChange={setSort}
            vizMode={vizMode}
            onVizModeChange={setVizMode}
            totalCount={aggregate.itemCount}
            isActiveRanking={isActiveRanking}
            sourceRowCount={sourceRowCount}
            filteredCount={toolbarFilteredCount}
          />
        }
        body={renderBody()}
        rail={
          <ConsensusRailSlot
            rankingCount={aggregate.rankingCount}
            aggregateForStats={renderFrame?.aggregate ?? aggregate ?? null}
            spotlightRanking={spotlightRanking}
            activeSlug={activeSlug}
            onSelectRanking={setActiveSlug}
            railResult={railResult}
            railTab={railTab}
            onRailTabChange={setRailTab}
          />
        }
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
      <ConsensusSectionHeader
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
