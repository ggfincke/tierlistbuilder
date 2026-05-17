// src/features/marketplace/components/consensus/item/DistributionBar.tsx
// stacked-bar distribution renderer, used by the bars viz + the popover

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import { formatPercent, resolveBucketColor } from '../lib/utils'

interface DistributionBarProps
{
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  distribution: MarketplaceTemplateRankingAggregateItem['distribution']
  sampleCount: number
  height?: number
}

export const DistributionBar = ({
  buckets,
  distribution,
  sampleCount,
  height = 10,
}: DistributionBarProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  if (sampleCount === 0)
  {
    return (
      <div
        className="flex w-full items-center justify-center rounded-full bg-[rgb(var(--t-overlay)/0.04)] text-[10px] text-[var(--t-text-faint)]"
        style={{ height }}
      >
        no samples
      </div>
    )
  }
  return (
    <div
      role="img"
      aria-label="Distribution across tiers"
      className="flex w-full overflow-hidden rounded-full bg-[rgb(var(--t-overlay)/0.04)]"
      style={{ height }}
    >
      {distribution.map((cell) =>
      {
        if (cell.share <= 0) return null
        const bucket = buckets[cell.bucketIndex]
        return (
          <span
            key={cell.bucketIndex}
            title={`${bucket?.label ?? `Tier ${cell.bucketIndex + 1}`} • ${formatPercent(cell.share)}`}
            className="block h-full"
            style={{
              width: `${cell.share * 100}%`,
              backgroundColor: resolveBucketColor(bucket, paletteId),
            }}
          />
        )
      })}
    </div>
  )
}

// mini overlay variant — positioned absolutely along the bottom of a thumb &
// reveal on group-hover. caller is responsible for the relative wrapper
export const MiniDistributionBar = ({
  buckets,
  distribution,
  sampleCount,
}: {
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  distribution: MarketplaceTemplateRankingAggregateItem['distribution']
  sampleCount: number
}) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  if (sampleCount === 0) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-1 bottom-1 flex h-1.5 overflow-hidden rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      {distribution.map((cell) =>
      {
        if (cell.share <= 0) return null
        return (
          <span
            key={cell.bucketIndex}
            className="block h-full"
            style={{
              width: `${cell.share * 100}%`,
              backgroundColor: resolveBucketColor(
                buckets[cell.bucketIndex],
                paletteId
              ),
            }}
          />
        )
      })}
    </div>
  )
}
