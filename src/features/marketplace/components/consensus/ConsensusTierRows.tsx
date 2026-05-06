// src/features/marketplace/components/consensus/ConsensusTierRows.tsx
// default consensus viz — items grouped into modal-tier rows. each item is
// a clickable thumb w/ a hover-revealed mini distribution bar

import { useMemo } from 'react'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from './AggregateItemThumb'
import { MiniDistributionBar } from './DistributionBar'
import { formatPercent, resolveBucketColor } from './utils'

interface ConsensusTierRowsProps
{
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  onOpenItem: (
    row: MarketplaceTemplateRankingAggregateItem,
    target: Element
  ) => void
  thumbSize?: number
  // optional viewer-placement overlay: maps templateItemExternalId -> bucket
  // index. items where the viewer's pick differs from the modal bucket get
  // a small accent badge in the viewer's tier color
  yourPlacements?: Record<string, number> | null
}

interface TierGroup
{
  bucket: MarketplaceTemplateRankingAggregateBucket
  items: MarketplaceTemplateRankingAggregateItem[]
}

const groupRowsByModalBucket = (
  rows: readonly MarketplaceTemplateRankingAggregateItem[],
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
): TierGroup[] =>
{
  const groups: TierGroup[] = buckets.map((bucket) => ({ bucket, items: [] }))
  for (const row of rows)
  {
    if (row.topBucketIndex === null) continue
    const group = groups[row.topBucketIndex]
    if (group) group.items.push(row)
  }
  for (const group of groups)
  {
    group.items.sort((a, b) => b.topBucketShare - a.topBucketShare)
  }
  return groups
}

interface TierItemButtonProps
{
  row: MarketplaceTemplateRankingAggregateItem
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  size: number
  onOpen: (
    row: MarketplaceTemplateRankingAggregateItem,
    target: Element
  ) => void
  yourBucket: MarketplaceTemplateRankingAggregateBucket | null
}

const TierItemButton = ({
  row,
  buckets,
  frame,
  labelSettings,
  size,
  onOpen,
  yourBucket,
}: TierItemButtonProps) =>
{
  const top = row.topBucketIndex !== null ? buckets[row.topBucketIndex] : null
  const titleParts = [row.label?.trim() || row.templateItemExternalId]
  if (top && row.sampleCount > 0)
  {
    titleParts.push(`${formatPercent(row.topBucketShare)} ${top.label}`)
  }
  if (yourBucket)
  {
    titleParts.push(`You: ${yourBucket.label}`)
  }
  return (
    <button
      type="button"
      onClick={(event) => onOpen(row, event.currentTarget)}
      className="focus-custom group relative inline-flex shrink-0 cursor-pointer rounded-md transition hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      title={titleParts.join(' — ')}
    >
      <AggregateItemThumb
        row={row}
        frame={frame}
        labelSettings={labelSettings}
        size={size}
      />
      <MiniDistributionBar
        buckets={buckets}
        distribution={row.distribution}
        sampleCount={row.sampleCount}
      />
      {row.isControversial && (
        <span
          aria-label="Controversial placement"
          className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--t-destructive)] text-[9px] font-bold text-white shadow"
        >
          !
        </span>
      )}
      {yourBucket && (
        <span
          aria-label={`You placed this in ${yourBucket.label}`}
          title={`You placed this in ${yourBucket.label}`}
          className="absolute -bottom-1 -left-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold ring-2 ring-[var(--t-bg-sunken)]"
          style={{
            background: resolveBucketColor(yourBucket),
            color: 'rgba(0,0,0,0.78)',
          }}
        >
          {yourBucket.label}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 -bottom-px truncate rounded-b-md bg-black/65 px-1 py-0.5 text-center text-[9px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {row.label?.trim() || row.templateItemExternalId}
      </span>
    </button>
  )
}

export const ConsensusTierRows = ({
  rows,
  buckets,
  frame,
  labelSettings,
  onOpenItem,
  thumbSize = 56,
  yourPlacements,
}: ConsensusTierRowsProps) =>
{
  const groups = useMemo(
    () => groupRowsByModalBucket(rows, buckets),
    [rows, buckets]
  )

  const resolveYourBucket = (
    row: MarketplaceTemplateRankingAggregateItem
  ): MarketplaceTemplateRankingAggregateBucket | null =>
  {
    if (!yourPlacements) return null
    const yourIdx = yourPlacements[row.templateItemExternalId]
    if (yourIdx === undefined) return null
    if (row.topBucketIndex === yourIdx) return null
    return buckets[yourIdx] ?? null
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
      {groups.map((group, index) => (
        <div
          key={group.bucket.index}
          className={`flex min-h-[80px] items-stretch ${
            index > 0 ? 'border-t border-[var(--t-border)]' : ''
          }`}
        >
          <div
            className="flex w-16 shrink-0 flex-col items-center justify-center text-2xl font-bold"
            style={{
              background: resolveBucketColor(group.bucket),
              color: 'rgba(0,0,0,0.78)',
              textShadow: '0 1px 0 rgba(255,255,255,0.18)',
            }}
            aria-label={`Tier ${group.bucket.label}`}
          >
            <span>{group.bucket.label}</span>
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-black/55">
              {group.items.length}
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-1.5 bg-[var(--t-bg-sunken)] p-2">
            {group.items.length === 0 ? (
              <span className="px-2 text-xs text-[var(--t-text-faint)]">—</span>
            ) : (
              group.items.map((row) => (
                <TierItemButton
                  key={row.externalId}
                  row={row}
                  buckets={buckets}
                  frame={frame}
                  labelSettings={labelSettings}
                  size={thumbSize}
                  onOpen={onOpenItem}
                  yourBucket={resolveYourBucket(row)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
