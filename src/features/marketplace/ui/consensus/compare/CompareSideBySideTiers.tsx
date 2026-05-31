// src/features/marketplace/ui/consensus/compare/CompareSideBySideTiers.tsx
// side-by-side tier viz built on shared board primitives — one tier band
// spans both lanes; the divergence table below carries the Δ-tier signal

import { useMemo } from 'react'

import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardItemDisplaySettings } from '@tierlistbuilder/contracts/workspace/board'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '~/shared/board-ui/BoardPrimitives'
import { itemSlotDimensions, LABEL_WIDTH_PX } from '~/shared/board-ui/constants'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { SectionEyebrow } from '~/features/marketplace/ui/consensus/SectionEyebrow'
import { useTierLabelPreferences } from '../lib/useTierLabelPreferences'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../item/AggregateItemThumb'
import { getAggregateItemLabel, resolveBucketColor } from '../lib/utils'

import { type CompareLaneSide } from './CompareLaneHeader'
import { type CompareJoinedRow } from './laneUtils'

// match the single-lane consensus tier rows so compare reads as the same
// surface composed twice rather than its own visual language
const COMPARE_ITEM_SIZE: ItemSize = 'medium'

interface CompareSideBySideTiersProps
{
  rows: readonly CompareJoinedRow[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  displaySettings: BoardItemDisplaySettings
  leftShortName: string
  rightShortName: string
  itemSize?: ItemSize
}

interface TierGroup
{
  bucket: MarketplaceTemplateRankingAggregateBucket
  lanes: Record<CompareLaneSide, CompareJoinedRow[]>
}

const emptyGroupsFromBuckets = (
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
): TierGroup[] =>
  buckets.map((bucket) => ({
    bucket,
    lanes: { left: [], right: [] },
  }))

const OTHER_SIDE: Record<CompareLaneSide, CompareLaneSide> = {
  left: 'right',
  right: 'left',
}

interface CompareThumbProps
{
  joined: CompareJoinedRow
  side: CompareLaneSide
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  frame: AggregateItemFrame
  displaySettings: BoardItemDisplaySettings
  thumbWidth: number
}

const CompareThumb = ({
  joined,
  side,
  buckets,
  frame,
  displaySettings,
  thumbWidth,
}: CompareThumbProps) =>
{
  const row = joined[side]
  const otherRow = joined[OTHER_SIDE[side]]
  const label = getAggregateItemLabel(row)
  const otherIndex = otherRow.topBucketIndex
  const otherLabel = otherIndex !== null ? buckets[otherIndex]?.label : null
  return (
    <div
      className="group relative shrink-0"
      title={`${label} · ${
        joined.absDelta === 0
          ? 'Same tier in both lanes'
          : `Δ${joined.absDelta} (other lane: ${otherLabel ?? '—'})`
      }`}
    >
      <AggregateItemThumb
        row={row}
        frame={frame}
        displaySettings={displaySettings}
        size={thumbWidth}
        bare
      />
      <span className="pointer-events-none absolute inset-x-0 -bottom-px truncate bg-black/65 px-1 py-0.5 text-center text-[9px] font-medium text-white opacity-0 transition group-hover:opacity-100">
        {label}
      </span>
    </div>
  )
}

export const CompareSideBySideTiers = ({
  rows,
  buckets,
  frame,
  displaySettings,
  leftShortName,
  rightShortName,
  itemSize = COMPARE_ITEM_SIZE,
}: CompareSideBySideTiersProps) =>
{
  const {
    paletteId,
    labelWidth,
    tierLabelBold,
    tierLabelItalic,
    tierLabelFontSize,
    compactMode,
  } = useTierLabelPreferences()

  const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
    itemSize,
    frame.aspectRatio
  )

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
        groupList[li].lanes.left.push(row)
      }
      if (ri !== null && groupList[ri])
      {
        groupList[ri].lanes.right.push(row)
      }
    }
    // sort each cell so the most-confident items come first; mirrors the
    // ordering used in the existing tier-row viz
    for (const group of groupList)
    {
      group.lanes.left.sort(
        (a, b) => b.left.topBucketShare - a.left.topBucketShare
      )
      group.lanes.right.sort(
        (a, b) => b.right.topBucketShare - a.right.topBucketShare
      )
    }
    return groupList
  }, [buckets, rows])

  const labelCellWidth = LABEL_WIDTH_PX[labelWidth]
  const lanes: ReadonlyArray<{ side: CompareLaneSide; name: string }> = [
    { side: 'left', name: leftShortName },
    { side: 'right', name: rightShortName },
  ]

  return (
    <div
      role="group"
      aria-label="Side-by-side ranking comparison"
      className="overflow-hidden rounded-md"
    >
      <div className="flex bg-[var(--t-bg-sunken)]" aria-hidden="true">
        {lanes.map(({ side, name }) => (
          <div
            key={side}
            className="flex min-w-0 flex-1 border-l border-[var(--t-border)]"
          >
            <div
              style={{ width: labelCellWidth }}
              className="shrink-0 border-r border-[var(--t-border)]"
            />
            <SectionEyebrow
              as="div"
              className="flex flex-1 items-center px-3 py-1.5"
            >
              {name}
            </SectionEyebrow>
          </div>
        ))}
      </div>

      {groups.map((group, index) =>
      {
        const color = resolveBucketColor(group.bucket, paletteId)
        return (
          <BoardRowSurface key={group.bucket.index}>
            {lanes.map(({ side }) =>
            {
              const items = group.lanes[side]
              return (
                <BoardRowContent key={side} index={index}>
                  <BoardLabelCellFrame
                    color={color}
                    itemSize={itemSize}
                    labelWidth={labelWidth}
                    tierLabelBold={tierLabelBold}
                    tierLabelItalic={tierLabelItalic}
                    tierLabelFontSize={tierLabelFontSize}
                    itemAspectRatio={frame.aspectRatio}
                  >
                    <div className="flex flex-col items-center">
                      <span className="block max-w-full break-words [overflow-wrap:anywhere]">
                        {group.bucket.label}
                      </span>
                      <TierDescriptionSubtitle
                        description={formatCountedWord(items.length, 'item')}
                      />
                    </div>
                  </BoardLabelCellFrame>

                  <BoardItemsGrid
                    compactMode={compactMode}
                    minHeightPx={slotHeight}
                    data-bucket-index={group.bucket.index}
                    data-side={side}
                  >
                    {items.length === 0 ? (
                      <span className="px-3 py-2 text-xs text-[var(--t-text-faint)]">
                        —
                      </span>
                    ) : (
                      items.map((row) => (
                        <CompareThumb
                          key={`${side}-${row.templateItemExternalId}`}
                          joined={row}
                          side={side}
                          buckets={buckets}
                          frame={frame}
                          displaySettings={displaySettings}
                          thumbWidth={slotWidth}
                        />
                      ))
                    )}
                  </BoardItemsGrid>
                </BoardRowContent>
              )
            })}
          </BoardRowSurface>
        )
      })}
    </div>
  )
}
