// convex/marketplace/rankings/aggregate.ts
// shared template-ranking aggregate read-model helpers

import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { MAX_SYNC_TIERS } from '../../lib/limits'
import {
  DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE,
  MAX_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE,
  TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN,
  TEMPLATE_RANKING_AGGREGATE_CONTROVERSY_MIN,
  TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX,
  makeEmptyBucketSpread,
  type MarketplaceTemplateRankingAggregate,
  type MarketplaceTemplateRankingAggregateBucket,
  type MarketplaceTemplateRankingAggregateItem,
  type TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  DEFAULT_TEMPLATE_TIERS,
  createTemplateProjectionCache,
  toTemplateMediaRef,
} from '../templates/lib'

type DbCtx = QueryCtx | MutationCtx

const ACTIVE_JOB_STATUSES = ['queued', 'running'] as const
const UNSAMPLED_SORT_OFFSET = MAX_SYNC_TIERS + 1

export const DEFAULT_TEMPLATE_RANKING_AGGREGATE_SORT =
  'templateOrder' satisfies TemplateRankingAggregateItemSort

export const normalizeTemplateRankingAggregateItemPageSize = (
  raw: number
): number =>
{
  if (!Number.isFinite(raw))
  {
    return DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE
  }
  return Math.max(
    1,
    Math.min(MAX_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE, Math.floor(raw))
  )
}

export const resolveTemplateRankingAggregateBucketCount = (
  template: Pick<Doc<'templates'>, 'suggestedTiers'>
): number =>
  Math.max(
    1,
    Math.min(
      MAX_SYNC_TIERS,
      template.suggestedTiers.length || DEFAULT_TEMPLATE_TIERS.length
    )
  )

export const makeEmptyDistribution = (
  bucketCount: number
): Doc<'templateRankingAggregateItems'>['distribution'] =>
  Array.from({ length: bucketCount }, (_, bucketIndex) => ({
    bucketIndex,
    count: 0,
  }))

const bucketLabel = (tiers: readonly TierPresetTier[], index: number): string =>
  tiers[index]?.name.trim() || `Tier ${index + 1}`

const bucketColor = (
  tiers: readonly TierPresetTier[],
  index: number
): MarketplaceTemplateRankingAggregateBucket['colorSpec'] =>
  tiers[index]?.colorSpec ?? null

const templateRankingAggregateBucketTiers = (
  template: Pick<Doc<'templates'>, 'suggestedTiers'>,
  bucketCount: number
): readonly TierPresetTier[] =>
{
  const tiers =
    template.suggestedTiers.length > 0
      ? template.suggestedTiers
      : DEFAULT_TEMPLATE_TIERS
  return tiers.slice(0, bucketCount)
}

export const resolveTemplateRankingAggregateBucketLabels = (
  template: Pick<Doc<'templates'>, 'suggestedTiers'>,
  bucketCount: number
): string[] =>
  templateRankingAggregateBucketTiers(template, bucketCount).map((tier) =>
    tier.name.trim()
  )

const toBuckets = (
  template: Pick<Doc<'templates'>, 'suggestedTiers'>,
  bucketCount: number
): MarketplaceTemplateRankingAggregateBucket[] =>
{
  const tiers = templateRankingAggregateBucketTiers(template, bucketCount)
  return Array.from({ length: bucketCount }, (_, index) => ({
    index,
    label: bucketLabel(tiers, index),
    colorSpec: bucketColor(tiers, index),
  }))
}

export const toTemplateRankingAggregate = (
  template: Pick<
    Doc<'templates'>,
    'slug' | 'title' | 'category' | 'itemCount'
  > &
    Pick<Doc<'templates'>, 'suggestedTiers'>,
  aggregate: Doc<'templateRankingAggregates'>
): MarketplaceTemplateRankingAggregate => ({
  template: {
    slug: template.slug,
    title: template.title,
    category: template.category,
    itemCount: template.itemCount,
  },
  state: aggregate.state,
  activeGeneration: aggregate.activeGeneration,
  bucketCount: aggregate.bucketCount,
  rankingCount: aggregate.rankingCount,
  itemCount: aggregate.itemCount,
  computedAt: aggregate.computedAt,
  staleAt: aggregate.staleAt,
  buckets: toBuckets(template, aggregate.bucketCount),
  bucketSpread:
    aggregate.bucketSpread ?? makeEmptyBucketSpread(aggregate.bucketCount),
})

export const findTemplateRankingAggregate = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateRankingAggregates'> | null> =>
  await ctx.db
    .query('templateRankingAggregates')
    .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
    .unique()

const findActiveAggregateJob = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateRankingAggregateJobs'> | null> =>
{
  for (const status of ACTIVE_JOB_STATUSES)
  {
    const job = await ctx.db
      .query('templateRankingAggregateJobs')
      .withIndex('byTemplateIdAndStatus', (q) =>
        q.eq('templateId', templateId).eq('status', status)
      )
      .take(1)
    if (job[0]) return job[0]
  }
  return null
}

const nextAggregateGeneration = (
  now: number,
  aggregate: Doc<'templateRankingAggregates'> | null
): number => Math.max(now, (aggregate?.activeGeneration ?? 0) + 1)

export const queueTemplateRankingAggregateRecompute = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  now: number
): Promise<void> =>
{
  const template = await ctx.db.get(templateId)
  if (!template) return

  const aggregate = await findTemplateRankingAggregate(ctx, templateId)
  const bucketCount = resolveTemplateRankingAggregateBucketCount(template)
  const targetBucketLabels = resolveTemplateRankingAggregateBucketLabels(
    template,
    bucketCount
  )
  const state = aggregate?.activeGeneration === null ? 'computing' : 'stale'
  if (aggregate)
  {
    await ctx.db.patch(aggregate._id, {
      state,
      bucketCount,
      itemCount: template.itemCount,
      staleAt: now,
      updatedAt: now,
    })
  }
  else
  {
    await ctx.db.insert('templateRankingAggregates', {
      templateId,
      state: 'computing',
      activeGeneration: null,
      bucketCount,
      rankingCount: 0,
      itemCount: template.itemCount,
      computedAt: null,
      staleAt: now,
      bucketSpread: makeEmptyBucketSpread(bucketCount),
      updatedAt: now,
    })
  }

  const activeJob = await findActiveAggregateJob(ctx, templateId)
  if (activeJob)
  {
    await ctx.db.patch(activeJob._id, {
      restartRequestedAt: now,
      updatedAt: now,
    })
    return
  }

  const jobId = await ctx.db.insert('templateRankingAggregateJobs', {
    templateId,
    status: 'queued',
    phase: 'seedItems',
    generation: nextAggregateGeneration(now, aggregate),
    bucketCount,
    targetBucketLabels,
    itemCount: 0,
    rankingCount: 0,
    publicRankingCount: 0,
    templateCursor: null,
    rankingCursor: null,
    rankingScanDone: false,
    activeRankingId: null,
    activeRankingItemCursor: null,
    bucketSpread: makeEmptyBucketSpread(bucketCount),
    restartRequestedAt: null,
    retryCount: 0,
    lastError: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.rankings.aggregateInternal
      .processTemplateRankingAggregateJob,
    { jobId }
  )
}

export const deleteTemplateRankingAggregateParentRows = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const aggregate = await findTemplateRankingAggregate(ctx, templateId)
  const jobs = await ctx.db
    .query('templateRankingAggregateJobs')
    .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
    .take(16)
  await Promise.all([
    ...(aggregate ? [ctx.db.delete(aggregate._id)] : []),
    ...jobs.map((job) => ctx.db.delete(job._id)),
  ])
}

const toDistribution = (
  row: Doc<'templateRankingAggregateItems'>
): MarketplaceTemplateRankingAggregateItem['distribution'] =>
  row.distribution.map((cell) => ({
    ...cell,
    share: row.sampleCount > 0 ? cell.count / row.sampleCount : 0,
  }))

export const toTemplateRankingAggregateItem = async (
  ctx: DbCtx,
  row: Doc<'templateRankingAggregateItems'>,
  cache: ReturnType<typeof createTemplateProjectionCache>
): Promise<MarketplaceTemplateRankingAggregateItem> =>
{
  return {
    externalId: row.templateItemExternalId,
    templateItemExternalId: row.templateItemExternalId,
    label: row.label,
    backgroundColor: row.backgroundColor,
    altText: row.altText,
    media: await toTemplateMediaRef(ctx, row.mediaAssetId, 'tile', cache),
    order: row.order,
    aspectRatio: row.aspectRatio,
    imageFit: row.imageFit,
    transform: row.transform,
    sampleCount: row.sampleCount,
    averageBucket: row.averageBucket,
    topBucketIndex: row.topBucketIndex,
    topBucketShare: row.topBucketShare,
    consensusScore: row.consensusScore,
    controversyScore: row.controversyScore,
    isTopBucket: row.isTopBucket,
    isBottomBucket: row.isBottomBucket,
    isControversial: row.isControversial,
    distribution: toDistribution(row),
  }
}

const clampScore = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

export const isTopAggregateBucket = (bucketIndex: number | null): boolean =>
  bucketIndex !== null &&
  bucketIndex <= TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX

export const isBottomAggregateBucket = (bucketIndex: number | null): boolean =>
  bucketIndex !== null &&
  bucketIndex >= TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN

export const isControversialAggregateItem = (
  sampleCount: number,
  controversyScore: number
): boolean =>
  sampleCount > 0 &&
  controversyScore > TEMPLATE_RANKING_AGGREGATE_CONTROVERSY_MIN

export const buildAggregateItemMetrics = (params: {
  distribution: Doc<'templateRankingAggregateItems'>['distribution']
  sampleCount: number
  bucketWeightSum: number
  bucketSquareSum: number
  bucketCount: number
}) =>
{
  if (params.sampleCount === 0)
  {
    return {
      averageBucket: null,
      topBucketIndex: null,
      topBucketShare: 0,
      consensusScore: 0,
      controversyScore: 0,
      averageTopSort: UNSAMPLED_SORT_OFFSET,
      averageBottomSort: UNSAMPLED_SORT_OFFSET,
      consensusSort: UNSAMPLED_SORT_OFFSET,
      controversySort: UNSAMPLED_SORT_OFFSET,
      isTopBucket: false,
      isBottomBucket: false,
      isControversial: false,
    }
  }

  const averageBucket = params.bucketWeightSum / params.sampleCount
  const top = params.distribution.reduce(
    (best, cell) => (cell.count > best.count ? cell : best),
    { bucketIndex: 0, count: -1 }
  )
  const topBucketShare = top.count / params.sampleCount
  const variance = Math.max(
    0,
    params.bucketSquareSum / params.sampleCount - averageBucket ** 2
  )
  const maxVariance =
    params.bucketCount <= 1 ? 0 : (params.bucketCount - 1) ** 2 / 4
  const controversyScore =
    maxVariance > 0 ? clampScore(variance / maxVariance) : 0
  const isTopBucket = isTopAggregateBucket(top.bucketIndex)
  const isBottomBucket = isBottomAggregateBucket(top.bucketIndex)
  const isControversial = isControversialAggregateItem(
    params.sampleCount,
    controversyScore
  )

  return {
    averageBucket,
    topBucketIndex: top.bucketIndex,
    topBucketShare,
    consensusScore: topBucketShare,
    controversyScore,
    averageTopSort: averageBucket,
    averageBottomSort: -averageBucket,
    consensusSort: -topBucketShare,
    controversySort: -controversyScore,
    isTopBucket,
    isBottomBucket,
    isControversial,
  }
}
