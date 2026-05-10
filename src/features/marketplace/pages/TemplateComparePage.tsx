// src/features/marketplace/pages/TemplateComparePage.tsx
// criterion vs criterion compare surface; lanes deep-link via ?left=&right=
// & the page joins both lanes' aggregate items by templateItemId

import { ArrowLeft, ArrowLeftRight } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import {
  isTemplateSlug,
  type MarketplaceTemplateDetail,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  isTemplateRankingAggregateReady as isAggregateReady,
  type MarketplaceTemplateRankingAggregate,
  type MarketplaceTemplateRankingAggregateBucket,
  type MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

import {
  useTemplateRankingAggregate,
  useTemplateRankingAggregateItems,
  type TemplateRankingAggregateItemsPageStatus,
} from '~/features/marketplace/model/useRankingDetail'
import {
  findActiveCriterion,
  findPrimaryCriterion,
  selectBusiestOtherCriterion,
} from '~/features/marketplace/model/criterionSelection'
import { useTemplateBySlug } from '~/features/marketplace/model/useTemplateDetail'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { SkeletonBlock } from '~/shared/ui/Skeleton'

import { templateFrame } from '~/features/marketplace/components/consensus/utils'
import { MarketplaceBreadcrumb } from '~/features/marketplace/components/layout/MarketplaceBreadcrumb'
import { MarketplaceNotFound } from '~/features/marketplace/components/layout/MarketplaceNotFound'
import { LoadingBlock } from '~/features/marketplace/components/consensus/LoadingBlock'
import { CompareDivergenceTable } from '~/features/marketplace/components/consensus/compare/CompareDivergenceTable'
import { CompareInsightStrip } from '~/features/marketplace/components/consensus/compare/CompareInsightStrip'
import { CompareLaneHeader } from '~/features/marketplace/components/consensus/compare/CompareLaneHeader'
import { CompareNarrativeCards } from '~/features/marketplace/components/consensus/compare/CompareNarrativeCards'
import { CompareScatter } from '~/features/marketplace/components/consensus/compare/CompareScatter'
import { CompareSideBySideTiers } from '~/features/marketplace/components/consensus/compare/CompareSideBySideTiers'
import { CompareTierFlow } from '~/features/marketplace/components/consensus/compare/CompareTierFlow'
import {
  computeCompareInsights,
  joinLanesByTemplateItem,
} from '~/features/marketplace/components/consensus/compare/laneUtils'

interface ResolvedSelection
{
  left: MarketplaceTemplateCriterion
  right: MarketplaceTemplateCriterion
  isSwapped: boolean
}

const LEFT_PARAM = 'left'
const RIGHT_PARAM = 'right'
const EMPTY_BUCKETS: MarketplaceTemplateRankingAggregateBucket[] = []

// resolves left/right from URL: missing left -> primary; missing right ->
// busiest other lane; collision -> swap right to the next active lane
const resolveSelection = (
  template: MarketplaceTemplateDetail,
  activeCriteria: readonly MarketplaceTemplateCriterion[],
  leftParam: string | null,
  rightParam: string | null
): ResolvedSelection | null =>
{
  if (activeCriteria.length < 2) return null
  const sorted = [...activeCriteria].sort((a, b) => a.order - b.order)
  const primary = findPrimaryCriterion(activeCriteria) ?? sorted[0]!
  const left = findActiveCriterion(activeCriteria, leftParam) ?? primary
  // pick the right side from the URL first; if missing/invalid/equal to
  // left, default to the busiest *other* criterion (most rankings) &
  // fall back to the next-by-order if no rankings exist anywhere yet
  let right = findActiveCriterion(activeCriteria, rightParam)
  if (!right || right.externalId === left.externalId)
  {
    const counts = template.rankingCountByCriterion ?? {}
    right = selectBusiestOtherCriterion(sorted, left.externalId, counts)
  }
  if (!right) return null
  return {
    left,
    right,
    isSwapped: leftParam === right.externalId && rightParam === left.externalId,
  }
}

interface CompareLaneItemsResult
{
  items: MarketplaceTemplateRankingAggregateItem[]
  status: TemplateRankingAggregateItemsPageStatus
  loadMore: (count?: number) => void
}

// drives auto-pagination so the compare surface always operates on the full
// list. without this we'd render charts on the first 100 items & silently
// miss the rest of a 200/500-roster template
const useFullyLoadedAggregateItems = (
  templateSlug: string,
  criterionExternalId: string,
  generation: number | null,
  enabled: boolean
): CompareLaneItemsResult =>
{
  const result = useTemplateRankingAggregateItems({
    templateSlug,
    criterionExternalId,
    generation,
    sort: 'templateOrder',
    enabled,
    pageSize: 100,
  })
  const { status, loadMore } = result
  // template order is stable & the page-size cap is 100, so we keep
  // requesting the next page until the cursor exhausts. effects that
  // ignore returned promises read fine w/ this loadMore signature
  useEffect(() =>
  {
    if (!enabled) return
    if (status === 'CanLoadMore')
    {
      loadMore(100)
    }
  }, [enabled, loadMore, status])
  return result
}

const NotFound = () => (
  <MarketplaceNotFound
    title="Compare unavailable"
    body="That template either doesn't exist or doesn't have multiple criteria to compare."
    actionLabel="Back to gallery"
    to={TEMPLATES_ROUTE_PATH}
  />
)

const PageSkeleton = () => (
  <section
    aria-hidden="true"
    className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24"
  >
    <SkeletonBlock className="h-4 w-48 rounded" tone="soft" />
    <SkeletonBlock className="mt-5 h-9 w-2/3 rounded" tone="strong" />
    <SkeletonBlock className="mt-2 h-4 w-1/2 rounded" tone="soft" />
    <div className="mt-6 grid gap-3 lg:grid-cols-2">
      <SkeletonBlock className="h-28 rounded-xl" tone="soft" />
      <SkeletonBlock className="h-28 rounded-xl" tone="soft" />
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-32 rounded-xl" tone="soft" />
      ))}
    </div>
  </section>
)

const StateBlock = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-5 py-10 text-center">
    <p className="text-sm font-semibold text-[var(--t-text)]">{title}</p>
    <p className="mt-1 text-xs text-[var(--t-text-muted)]">{body}</p>
  </div>
)

// twin variants share the swap action — desktop floats over the lane-card
// gutter as a circular icon, mobile drops below the stacked headers as a
// labeled chip. one component keeps the onClick & a11y attrs in one place
const SwapLanesButton = ({
  variant,
  onClick,
}: {
  variant: 'desktop' | 'mobile'
  onClick: () => void
}) =>
{
  const sharedClass =
    'focus-custom items-center justify-center border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
  if (variant === 'desktop')
  {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Swap lanes"
        title="Swap lanes"
        className={`${sharedClass} absolute left-1/2 top-1/2 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--t-bg-page)] shadow-md lg:flex`}
      >
        <ArrowLeftRight className="h-4 w-4" strokeWidth={2.2} />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${sharedClass} mt-3 inline-flex gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium lg:hidden`}
    >
      <ArrowLeftRight className="h-3 w-3" strokeWidth={2.2} />
      Swap lanes
    </button>
  )
}

interface CompareBodyProps
{
  detail: MarketplaceTemplateDetail
  selection: ResolvedSelection
  activeCriteria: readonly MarketplaceTemplateCriterion[]
  onSwap: (next: { left?: string; right?: string }) => void
}

// inner component so the heavy data hooks only mount once we have a
// resolved selection; pulling this apart from the orchestration shell
// keeps the parent's URL-state code uncluttered
const CompareBody = ({
  detail,
  selection,
  activeCriteria,
  onSwap,
}: CompareBodyProps) =>
{
  const { left: leftCriterion, right: rightCriterion } = selection

  const leftAggregate = useTemplateRankingAggregate(
    detail.slug,
    leftCriterion.externalId
  )
  const rightAggregate = useTemplateRankingAggregate(
    detail.slug,
    rightCriterion.externalId
  )

  const leftReady = isAggregateReady(leftAggregate)
  const rightReady = isAggregateReady(rightAggregate)

  const leftItems = useFullyLoadedAggregateItems(
    detail.slug,
    leftCriterion.externalId,
    leftAggregate?.activeGeneration ?? null,
    leftReady
  )
  const rightItems = useFullyLoadedAggregateItems(
    detail.slug,
    rightCriterion.externalId,
    rightAggregate?.activeGeneration ?? null,
    rightReady
  )

  // both lanes need ready aggregates before we can compute insights — the
  // viz blocks would otherwise render against ghost data while one lane
  // catches up
  const aggregatesReady = leftReady && rightReady
  const itemsReady =
    aggregatesReady &&
    leftItems.status === 'Exhausted' &&
    rightItems.status === 'Exhausted'

  const joinedRows = useMemo(
    () => joinLanesByTemplateItem(leftItems.items, rightItems.items),
    [leftItems.items, rightItems.items]
  )

  // both aggregates project the same template buckets for now; we still
  // prefer the left lane's so we have a stable source of truth even if a
  // future per-criterion preset override lands
  const buckets =
    leftAggregate?.buckets ?? rightAggregate?.buckets ?? EMPTY_BUCKETS

  const insights = useMemo(
    () => computeCompareInsights(joinedRows, buckets.length),
    [buckets.length, joinedRows]
  )

  const frame = templateFrame(detail)
  const labelSettings = detail.labels
  const leftShortName = leftCriterion.shortName ?? leftCriterion.name
  const rightShortName = rightCriterion.shortName ?? rightCriterion.name

  const leftRankingCount = leftAggregate?.rankingCount ?? 0
  const rightRankingCount = rightAggregate?.rankingCount ?? 0

  const swapLanes = () =>
    onSwap({
      left: rightCriterion.externalId,
      right: leftCriterion.externalId,
    })

  return (
    <article className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24">
      <MarketplaceBreadcrumb
        items={[
          { label: 'Templates', to: TEMPLATES_ROUTE_PATH },
          {
            label: detail.title,
            to: `${TEMPLATES_ROUTE_PATH}/${detail.slug}`,
          },
          { label: 'Compare' },
        ]}
      />

      <header className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            Compare consensus
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--t-text)] sm:text-3xl">
            {leftCriterion.name} vs {rightCriterion.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--t-text-muted)]">
            Same {formatCountedWord(detail.itemCount, 'item')}, two community
            questions. The most interesting story is the items that fight for
            top tier in one lane and live in the basement in the other.
          </p>
        </div>
        <Link
          to={`${TEMPLATES_ROUTE_PATH}/${detail.slug}`}
          className="focus-custom inline-flex h-8 items-center gap-1 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2.5 text-[12px] font-medium text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.2} />
          Back to template
        </Link>
      </header>

      <section className="mt-6">
        <div className="relative grid gap-3 lg:grid-cols-2">
          <CompareLaneHeader
            side="left"
            criterion={leftCriterion}
            selectableCriteria={activeCriteria}
            otherSideExternalId={rightCriterion.externalId}
            onSelect={(externalId) => onSwap({ left: externalId })}
            aggregate={leftAggregate}
          />
          <CompareLaneHeader
            side="right"
            criterion={rightCriterion}
            selectableCriteria={activeCriteria}
            otherSideExternalId={leftCriterion.externalId}
            onSelect={(externalId) => onSwap({ right: externalId })}
            aggregate={rightAggregate}
          />
          <SwapLanesButton variant="desktop" onClick={swapLanes} />
        </div>
        <SwapLanesButton variant="mobile" onClick={swapLanes} />
      </section>

      {!aggregatesReady ? (
        <section className="mt-6">
          {renderLaneState(leftAggregate, rightAggregate)}
        </section>
      ) : !itemsReady ? (
        <section className="mt-6">
          <LoadingBlock
            message="Loading items for both lanes…"
            className="rounded-xl"
          />
        </section>
      ) : joinedRows.length === 0 ? (
        <section className="mt-6">
          <StateBlock
            title="Nothing to compare yet"
            body="One of these lanes hasn't aggregated any items in the same template generation. Recompute will pick this up automatically."
          />
        </section>
      ) : (
        <>
          <section className="mt-6">
            <CompareInsightStrip
              insights={insights}
              leftRankingCount={leftRankingCount}
              rightRankingCount={rightRankingCount}
              leftShortName={leftShortName}
              rightShortName={rightShortName}
            />
          </section>

          <section className="mt-6 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            <CompareScatter
              rows={joinedRows}
              buckets={buckets}
              leftShortName={leftShortName}
              rightShortName={rightShortName}
            />
            <CompareTierFlow
              rows={joinedRows}
              buckets={buckets}
              leftShortName={leftShortName}
              rightShortName={rightShortName}
            />
          </section>

          <section className="mt-6">
            <CompareNarrativeCards
              mostStable={insights.mostStable}
              mostDivergent={insights.mostDivergent}
              buckets={buckets}
              frame={frame}
              labelSettings={labelSettings}
              leftShortName={leftShortName}
              rightShortName={rightShortName}
            />
          </section>

          <section className="mt-8">
            <div className="mb-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
                Side by side
              </p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--t-text)]">
                Both rosters, ranked
              </h2>
              <p className="mt-1 text-xs text-[var(--t-text-muted)]">
                Each lane laid out as its own tier list. Compare tiers across
                the two for a quick read on where the rankings diverge.
              </p>
            </div>
            <CompareSideBySideTiers
              rows={joinedRows}
              buckets={buckets}
              frame={frame}
              labelSettings={labelSettings}
              leftShortName={leftShortName}
              rightShortName={rightShortName}
            />
          </section>

          <section className="mt-8">
            <div className="mb-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
                Where the lanes disagree
              </p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--t-text)]">
                Biggest gaps between {leftShortName} and {rightShortName}
              </h2>
              <p className="mt-1 text-xs text-[var(--t-text-muted)]">
                Sorted by absolute tier distance. Direction shows which lane
                rates the item higher.
              </p>
            </div>
            <CompareDivergenceTable
              rows={joinedRows}
              buckets={buckets}
              frame={frame}
              labelSettings={labelSettings}
              leftShortName={leftShortName}
              rightShortName={rightShortName}
            />
          </section>
        </>
      )}
    </article>
  )
}

const renderLaneState = (
  left: MarketplaceTemplateRankingAggregate | null | undefined,
  right: MarketplaceTemplateRankingAggregate | null | undefined
) =>
{
  // separate the messaging by which lane is the blocker so the user knows
  // exactly where the gap is
  if (left === undefined || right === undefined)
  {
    return <LoadingBlock message="Loading lane data…" className="rounded-xl" />
  }
  if (left === null || left.state === 'empty')
  {
    return (
      <StateBlock
        title="Left lane has no consensus yet"
        body="Once people publish rankings into this lane, the compare surface will populate."
      />
    )
  }
  if (right === null || right.state === 'empty')
  {
    return (
      <StateBlock
        title="Right lane has no consensus yet"
        body="Once people publish rankings into this lane, the compare surface will populate."
      />
    )
  }
  if (left.state === 'failed' || right.state === 'failed')
  {
    return (
      <StateBlock
        title="One of these lanes failed to compute"
        body="The current consensus pass couldn't finish for one of the criteria. New rankings will trigger another pass."
      />
    )
  }
  return (
    <LoadingBlock
      message="Computing consensus from public rankings…"
      className="rounded-xl"
    />
  )
}

export const TemplateComparePage = () =>
{
  const { slug } = useParams<{ slug: string }>()
  const validSlug = slug && isTemplateSlug(slug) ? slug : null
  const detail = useTemplateBySlug(validSlug)
  const [params, setParams] = useSearchParams()

  useDocumentTitle(
    detail ? `Compare · ${detail.title} · TierListBuilder` : null
  )

  if (validSlug === null) return <NotFound />
  if (detail === undefined) return <PageSkeleton />
  if (detail === null) return <NotFound />

  const activeCriteria = detail.criteria.filter((c) => c.status === 'active')
  if (activeCriteria.length < 2) return <NotFound />

  const selection = resolveSelection(
    detail,
    activeCriteria,
    params.get(LEFT_PARAM),
    params.get(RIGHT_PARAM)
  )
  if (!selection) return <NotFound />

  const handleSwap = (patch: { left?: string; right?: string }) =>
  {
    setParams(
      (prev) =>
      {
        const next = new URLSearchParams(prev)
        const desiredLeft = patch.left ?? selection.left.externalId
        const desiredRight = patch.right ?? selection.right.externalId
        // collision guard: if the user picks the same criterion on both
        // sides, swap the other side to whatever was previously here so we
        // don't render a degenerate self-comparison
        let left = desiredLeft
        let right = desiredRight
        if (left === right)
        {
          if (patch.left)
          {
            // user changed the left side to match the right; swap right to
            // the previous left
            right = selection.left.externalId
          }
          else if (patch.right)
          {
            left = selection.right.externalId
          }
        }
        next.set(LEFT_PARAM, left)
        next.set(RIGHT_PARAM, right)
        return next
      },
      { replace: true }
    )
  }

  return (
    <CompareBody
      detail={detail}
      selection={selection}
      activeCriteria={activeCriteria}
      onSwap={handleSwap}
    />
  )
}
