// src/features/marketplace/components/consensus/compare/CompareSideBySideTiers.tsx
// 4-col tier grid (label · left items · label · right items); item rings
// colored by Δ tier vs the other lane so mismatches stand out

import { useMemo } from 'react'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../AggregateItemThumb'
import { resolveBucketColor } from '../utils'
import { getAggregateItemLabel } from '../utils'
import { getTextColor } from '~/shared/lib/color'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import { compareDeltaTone, type CompareJoinedRow } from './laneUtils'

interface CompareSideBySideTiersProps
{
  rows: readonly CompareJoinedRow[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  leftShortName: string
  rightShortName: string
  itemSize?: number
}

const TONE_TO_RING_CLASS: Record<
  ReturnType<typeof compareDeltaTone>,
  string
> = {
  none: '',
  accent: 'ring-2 ring-[var(--t-accent)]',
  destructive: 'ring-2 ring-[var(--t-destructive)]',
}

interface TierGroup
{
  bucket: MarketplaceTemplateRankingAggregateBucket
  leftItems: CompareJoinedRow[]
  rightItems: CompareJoinedRow[]
}

const emptyGroupsFromBuckets = (
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
): TierGroup[] =>
  buckets.map((bucket) => ({
    bucket,
    leftItems: [],
    rightItems: [],
  }))

interface CompareThumbProps
{
  joined: CompareJoinedRow
  side: 'left' | 'right'
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  size: number
}

const CompareThumb = ({
  joined,
  side,
  buckets,
  frame,
  labelSettings,
  size,
}: CompareThumbProps) =>
{
  const tone = compareDeltaTone(joined.absDelta)
  const ringClass = TONE_TO_RING_CLASS[tone]
  const row = side === 'left' ? joined.left : joined.right
  const otherRow = side === 'left' ? joined.right : joined.left
  const label = getAggregateItemLabel(row)
  const otherIndex = otherRow.topBucketIndex
  const otherLabel = otherIndex !== null ? buckets[otherIndex]?.label : null
  return (
    <div
      className={`group relative shrink-0 rounded-md transition ${ringClass}`}
      title={`${label} · ${
        joined.absDelta === 0
          ? 'Same tier in both lanes'
          : `Δ${joined.absDelta} (other lane: ${otherLabel ?? '—'})`
      }`}
    >
      <AggregateItemThumb
        row={row}
        frame={frame}
        labelSettings={labelSettings}
        size={size}
      />
      <span className="pointer-events-none absolute inset-x-0 -bottom-px truncate rounded-b-md bg-black/65 px-1 py-0.5 text-center text-[8px] font-medium text-white opacity-0 transition group-hover:opacity-100">
        {label}
      </span>
    </div>
  )
}

export const CompareSideBySideTiers = ({
  rows,
  buckets,
  frame,
  labelSettings,
  leftShortName,
  rightShortName,
  itemSize = 42,
}: CompareSideBySideTiersProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  // group joined rows by each side's top bucket index — we walk the same
  // joined list twice rather than building two index maps because the
  // joined entries already carry both sides' top buckets
  const groups = useMemo(() =>
  {
    const groupList = emptyGroupsFromBuckets(buckets)
    for (const row of rows)
    {
      const li = row.left.topBucketIndex
      const ri = row.right.topBucketIndex
      if (li !== null && groupList[li])
      {
        groupList[li].leftItems.push(row)
      }
      if (ri !== null && groupList[ri])
      {
        groupList[ri].rightItems.push(row)
      }
    }
    // sort each cell so the most-confident items come first; mirrors the
    // ordering used in the existing tier-row viz
    for (const group of groupList)
    {
      group.leftItems.sort(
        (a, b) => b.left.topBucketShare - a.left.topBucketShare
      )
      group.rightItems.sort(
        (a, b) => b.right.topBucketShare - a.right.topBucketShare
      )
    }
    return groupList
  }, [buckets, rows])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]">
      <div
        className="grid grid-cols-[44px_1fr_44px_1fr] items-center bg-[var(--t-bg-sunken)]/60 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]"
        aria-hidden="true"
      >
        <span aria-hidden="true" />
        <span className="pl-2">{leftShortName}</span>
        <span aria-hidden="true" />
        <span className="pl-2">{rightShortName}</span>
      </div>
      {groups.map((group, i) =>
      {
        const color = resolveBucketColor(group.bucket, paletteId)
        const labelColor = getTextColor(color)
        return (
          <div
            key={group.bucket.index}
            className={`grid grid-cols-[44px_1fr_44px_1fr] items-stretch ${
              i > 0 ? 'border-t border-[var(--t-border)]' : ''
            }`}
          >
            <div
              className="flex items-center justify-center text-base font-bold"
              style={{ background: color, color: labelColor }}
            >
              {group.bucket.label}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 bg-[var(--t-bg-sunken)] p-2">
              {group.leftItems.length === 0 ? (
                <span className="px-2 text-xs text-[var(--t-text-faint)]">
                  —
                </span>
              ) : (
                group.leftItems.map((row) => (
                  <CompareThumb
                    key={`L-${row.templateItemExternalId}`}
                    joined={row}
                    side="left"
                    buckets={buckets}
                    frame={frame}
                    labelSettings={labelSettings}
                    size={itemSize}
                  />
                ))
              )}
            </div>
            <div
              className="flex items-center justify-center text-base font-bold"
              style={{ background: color, color: labelColor }}
            >
              {group.bucket.label}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 bg-[var(--t-bg-sunken)] p-2">
              {group.rightItems.length === 0 ? (
                <span className="px-2 text-xs text-[var(--t-text-faint)]">
                  —
                </span>
              ) : (
                group.rightItems.map((row) => (
                  <CompareThumb
                    key={`R-${row.templateItemExternalId}`}
                    joined={row}
                    side="right"
                    buckets={buckets}
                    frame={frame}
                    labelSettings={labelSettings}
                    size={itemSize}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// re-export so unit tests / future callers can use the same item shape
// without depending on aggregate-internal types
export type { MarketplaceTemplateRankingAggregateItem }
