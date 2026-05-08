// src/features/marketplace/components/consensus/ConsensusTierRows.tsx
// modal-tier-grouped viz built on shared board primitives, w/ hover distribution overlay

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type {
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '~/shared/board-ui/BoardPrimitives'
import { itemSlotDimensions } from '~/shared/board-ui/constants'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from './AggregateItemThumb'
import { MiniDistributionBar } from './DistributionBar'
import {
  formatPercent,
  getAggregateItemLabel,
  getTopBucket,
  resolveBucketColor,
} from './utils'

// pin marketplace tile size — large crowds the section, small reads dense
const CONSENSUS_ITEM_SIZE = 'medium' as const

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
  thumbWidth: number
  paletteId: PaletteId
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
  thumbWidth,
  paletteId,
  onOpen,
  yourBucket,
}: TierItemButtonProps) =>
{
  const top = getTopBucket(row, buckets)
  const titleParts = [getAggregateItemLabel(row)]
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
      className="focus-custom group relative inline-flex shrink-0 cursor-pointer transition hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      title={titleParts.join(' — ')}
    >
      <AggregateItemThumb
        row={row}
        frame={frame}
        labelSettings={labelSettings}
        size={thumbWidth}
        bare
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
          className="absolute -bottom-1 -left-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold ring-2 ring-[var(--t-bg-surface)]"
          style={{
            background: resolveBucketColor(yourBucket, paletteId),
            color: 'rgba(0,0,0,0.78)',
          }}
        >
          {yourBucket.label}
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 -bottom-px truncate bg-black/65 px-1 py-0.5 text-center text-[9px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {getAggregateItemLabel(row)}
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
  yourPlacements,
}: ConsensusTierRowsProps) =>
{
  const {
    paletteId,
    labelWidth,
    tierLabelBold,
    tierLabelItalic,
    tierLabelFontSize,
    compactMode,
  } = usePreferencesStore(
    useShallow((state) => ({
      paletteId: state.paletteId,
      labelWidth: state.labelWidth,
      tierLabelBold: state.tierLabelBold,
      tierLabelItalic: state.tierLabelItalic,
      tierLabelFontSize: state.tierLabelFontSize,
      compactMode: state.compactMode,
    }))
  )

  const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
    CONSENSUS_ITEM_SIZE,
    frame.aspectRatio
  )

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
    <div
      role="group"
      aria-label="Community consensus board"
      className="overflow-hidden rounded-md"
    >
      {groups.map((group, index) => (
        <BoardRowSurface key={group.bucket.index}>
          <BoardRowContent index={index}>
            <BoardLabelCellFrame
              color={resolveBucketColor(group.bucket, paletteId)}
              itemSize={CONSENSUS_ITEM_SIZE}
              labelWidth={labelWidth}
              tierLabelBold={tierLabelBold}
              tierLabelItalic={tierLabelItalic}
              tierLabelFontSize={tierLabelFontSize}
              itemAspectRatio={frame.aspectRatio}
            >
              <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight">
                <span className="block max-w-full break-words [overflow-wrap:anywhere]">
                  {group.bucket.label}
                </span>
                <TierDescriptionSubtitle
                  description={`${group.items.length} ${group.items.length === 1 ? 'item' : 'items'}`}
                />
              </div>
            </BoardLabelCellFrame>

            <BoardItemsGrid
              compactMode={compactMode}
              minHeightPx={slotHeight}
              data-bucket-index={group.bucket.index}
            >
              {group.items.length === 0 ? (
                <span className="px-3 py-2 text-xs text-[var(--t-text-faint)]">
                  —
                </span>
              ) : (
                group.items.map((row) => (
                  <TierItemButton
                    key={row.externalId}
                    row={row}
                    buckets={buckets}
                    frame={frame}
                    labelSettings={labelSettings}
                    thumbWidth={slotWidth}
                    paletteId={paletteId}
                    onOpen={onOpenItem}
                    yourBucket={resolveYourBucket(row)}
                  />
                ))
              )}
            </BoardItemsGrid>
          </BoardRowContent>
        </BoardRowSurface>
      ))}
    </div>
  )
}
