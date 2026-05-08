// src/features/marketplace/components/consensus/utils.ts
// shared formatters/helpers for the consensus surfaces (toolbar, viz, popover)

import type {
  MarketplaceTemplateRankingAggregateBucket,
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
