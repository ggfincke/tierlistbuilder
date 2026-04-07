// src/components/comparison/ReadOnlyBoard.tsx
// read-only board renderer for in-app comparison — no interactivity

import { memo } from 'react'

import type { PaletteId, TierItem, TierListData } from '../../types'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { ITEM_SIZE_PX } from '../../utils/constants'
import { ItemContent } from '../board/ItemContent'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '../board/BoardPrimitives'

export type DiffHighlight = 'promoted' | 'demoted' | 'added' | 'removed'

interface ReadOnlyBoardItemProps
{
  item: TierItem
  highlight?: DiffHighlight
}

const DIFF_RING: Record<DiffHighlight, string> = {
  promoted: 'ring-2 ring-green-400',
  demoted: 'ring-2 ring-red-400',
  added: 'ring-2 ring-blue-400',
  removed: 'opacity-30',
}

const ReadOnlyBoardItem = memo(
  ({ item, highlight }: ReadOnlyBoardItemProps) =>
  {
    const sizePx = ITEM_SIZE_PX.medium
    const highlightClass = highlight ? DIFF_RING[highlight] : ''

    return (
      <div
        style={{ width: sizePx, height: sizePx }}
        className={`relative overflow-hidden rounded ${highlightClass}`}
        title={item.label}
      >
        <ItemContent item={item} showLabel={!!item.label} />
      </div>
    )
  }
)

interface ReadOnlyBoardProps
{
  data: TierListData
  paletteId: PaletteId
  diffHighlights?: Map<string, DiffHighlight>
}

export const ReadOnlyBoard = memo(
  ({ data, paletteId, diffHighlights }: ReadOnlyBoardProps) =>
  {
    const sizePx = ITEM_SIZE_PX.medium

    return (
      <div>
        {data.tiers.map((tier, index) => (
          <BoardRowSurface key={tier.id}>
            <BoardRowContent index={index}>
              <BoardLabelCellFrame
                color={resolveTierColorSpec(paletteId, tier.colorSpec)}
                itemSize="medium"
                labelWidth="narrow"
                tierLabelBold={false}
                tierLabelItalic={false}
                tierLabelFontSize="small"
              >
                <div className="flex flex-col items-center">
                  <span className="block max-w-full break-words text-xs [overflow-wrap:anywhere]">
                    {tier.name}
                  </span>
                  <TierDescriptionSubtitle description={tier.description} />
                </div>
              </BoardLabelCellFrame>

              <BoardItemsGrid compactMode={true} minHeightPx={sizePx}>
                {tier.itemIds.map((itemId) =>
                {
                  const item = data.items[itemId]
                  if (!item) return null

                  return (
                    <ReadOnlyBoardItem
                      key={itemId}
                      item={item}
                      highlight={diffHighlights?.get(itemId)}
                    />
                  )
                })}
              </BoardItemsGrid>
            </BoardRowContent>
          </BoardRowSurface>
        ))}
      </div>
    )
  }
)
