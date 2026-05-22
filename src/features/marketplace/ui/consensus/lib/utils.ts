// src/features/marketplace/ui/consensus/lib/utils.ts
// shared formatters/helpers for the consensus surfaces (toolbar, viz, popover)

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import type { ImageFit } from '@tierlistbuilder/contracts/workspace/board'
import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import { FALLBACK_COLOR, resolveTierColorSpec } from '~/shared/theme/tierColors'

const FALLBACK_FRAME_RATIO = 1

export const SORT_LABELS: Record<TemplateRankingAggregateItemSort, string> = {
  templateOrder: 'Template order',
  averageTop: 'Highest avg',
  averageBottom: 'Lowest avg',
  consensus: 'Most agreed',
  consensusTop: 'Most agreed S/A',
  controversy: 'Most divisive',
}

export type ConsensusVizMode =
  | 'tiers'
  | 'bars'
  | 'heatmap'
  | 'scatter'
  | 'ranked'

export const templateFrame = (
  template: Pick<
    MarketplaceTemplateDetail,
    'itemAspectRatio' | 'defaultItemImageFit'
  >
): { aspectRatio: number; defaultFit: ImageFit } => ({
  aspectRatio: template.itemAspectRatio ?? FALLBACK_FRAME_RATIO,
  defaultFit: template.defaultItemImageFit ?? 'cover',
})

export const formatPercent = (share: number): string =>
{
  if (!Number.isFinite(share) || share <= 0) return '0%'
  const pct = share * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`
}

export const resolveBucketColor = (
  bucket: MarketplaceTemplateRankingAggregateBucket | undefined,
  paletteId: PaletteId
): string =>
  bucket?.colorSpec
    ? resolveTierColorSpec(paletteId, bucket.colorSpec)
    : FALLBACK_COLOR

export const bucketLabel = (
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[],
  index: number | null
): string =>
{
  if (index === null) return '—'
  return buckets[index]?.label ?? `Tier ${index + 1}`
}

export const getAggregateItemLabel = (
  row: Pick<
    MarketplaceTemplateRankingAggregateItem,
    'label' | 'templateItemExternalId'
  >
): string => row.label?.trim() || row.templateItemExternalId

const getBucketAtIndex = (
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[],
  index: number | null
): MarketplaceTemplateRankingAggregateBucket | undefined =>
  index === null ? undefined : buckets[index]

export const getTopBucket = (
  row: Pick<MarketplaceTemplateRankingAggregateItem, 'topBucketIndex'>,
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
): MarketplaceTemplateRankingAggregateBucket | undefined =>
  getBucketAtIndex(buckets, row.topBucketIndex)

export const getAverageBucket = (
  row: Pick<MarketplaceTemplateRankingAggregateItem, 'averageBucket'>,
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
): MarketplaceTemplateRankingAggregateBucket | undefined =>
  getBucketAtIndex(
    buckets,
    row.averageBucket === null ? null : Math.round(row.averageBucket)
  )

export const getControversyLabel = (
  row: Pick<
    MarketplaceTemplateRankingAggregateItem,
    'sampleCount' | 'controversyScore'
  >
): string =>
{
  if (row.sampleCount === 0) return 'No data'
  if (row.controversyScore < 0.3) return 'Strong consensus'
  if (row.controversyScore < 0.55) return 'Mixed'
  return 'Highly divisive'
}

export const distributionShareByBucket = (
  row: Pick<MarketplaceTemplateRankingAggregateItem, 'distribution'>
): Map<number, number> =>
{
  const byBucket = new Map<number, number>()
  for (const cell of row.distribution)
  {
    byBucket.set(cell.bucketIndex, cell.share)
  }
  return byBucket
}

export const avatarColor = (slug: string): string =>
{
  let hash = 0
  for (let i = 0; i < slug.length; i++)
  {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 60% 55%)`
}
