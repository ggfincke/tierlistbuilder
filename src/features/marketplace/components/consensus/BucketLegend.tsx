// src/features/marketplace/components/consensus/BucketLegend.tsx
// inline legend showing the bucket colors + labels — used above the bars viz
// so readers can map color -> tier without hovering

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

import { resolveBucketColor } from './utils'

interface BucketLegendProps
{
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
}

export const BucketLegend = ({ buckets }: BucketLegendProps) => (
  <ul className="flex flex-wrap items-center gap-1.5">
    {buckets.map((bucket) => (
      <li
        key={bucket.index}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-0.5 text-[11px] text-[var(--t-text-secondary)]"
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: resolveBucketColor(bucket) }}
        />
        {bucket.label}
      </li>
    ))}
  </ul>
)
