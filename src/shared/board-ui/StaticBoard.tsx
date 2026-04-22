// src/shared/board-ui/StaticBoard.tsx
// read-only board renderer shared between export capture & embed iframe

import { memo } from 'react'
import type { ReactNode } from 'react'

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/workspace/settings'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
} from '~/features/workspace/boards/lib/aspectRatio'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { itemSlotDimensions, SHAPE_CLASS } from '~/shared/board-ui/constants'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '~/shared/board-ui/BoardPrimitives'
import { ItemContent } from '~/shared/board-ui/ItemContent'

export interface StaticBoardAppearance
{
  itemSize: ItemSize
  showLabels: boolean
  itemShape: ItemShape
  compactMode: boolean
  labelWidth: LabelWidth
  paletteId: PaletteId
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
}

interface StaticBoardProps
{
  data: BoardSnapshot
  appearance: StaticBoardAppearance
  backgroundColor?: string
  className?: string
  children?: ReactNode
  'data-testid'?: string
}

export const StaticBoard = memo(
  ({
    data,
    appearance,
    backgroundColor,
    className,
    'data-testid': testId,
  }: StaticBoardProps) =>
  {
    const boardAspectRatio = getBoardItemAspectRatio(data)
    const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
      appearance.itemSize,
      boardAspectRatio
    )
    const boardDefaultFit = data.defaultItemImageFit

    return (
      <div
        data-testid={testId}
        className={className}
        style={backgroundColor ? { backgroundColor } : undefined}
      >
        {data.tiers.map((tier, index) =>
        {
          const rowBg = tier.rowColorSpec
            ? resolveTierColorSpec(appearance.paletteId, tier.rowColorSpec)
            : null

          return (
            <BoardRowSurface key={tier.id} backgroundOverride={rowBg}>
              <BoardRowContent index={index}>
                <BoardLabelCellFrame
                  color={resolveTierColorSpec(
                    appearance.paletteId,
                    tier.colorSpec
                  )}
                  itemSize={appearance.itemSize}
                  labelWidth={appearance.labelWidth}
                  tierLabelBold={appearance.tierLabelBold}
                  tierLabelItalic={appearance.tierLabelItalic}
                  tierLabelFontSize={appearance.tierLabelFontSize}
                  itemAspectRatio={boardAspectRatio}
                >
                  <div className="flex flex-col items-center">
                    <span className="block max-w-full break-words [overflow-wrap:anywhere]">
                      {tier.name}
                    </span>
                    <TierDescriptionSubtitle description={tier.description} />
                  </div>
                </BoardLabelCellFrame>

                <BoardItemsGrid
                  compactMode={appearance.compactMode}
                  minHeightPx={slotHeight}
                  backgroundOverride={rowBg}
                >
                  {tier.itemIds.map((itemId) =>
                  {
                    const item = data.items[itemId]
                    if (!item) return null

                    return (
                      <div
                        key={itemId}
                        style={{ width: slotWidth, height: slotHeight }}
                        className={`relative overflow-hidden ${SHAPE_CLASS[appearance.itemShape]}`}
                      >
                        <ItemContent
                          item={item}
                          showLabel={appearance.showLabels && !!item.label}
                          fit={getEffectiveImageFit(item, boardDefaultFit)}
                        />
                      </div>
                    )
                  })}
                </BoardItemsGrid>
              </BoardRowContent>
            </BoardRowSurface>
          )
        })}
      </div>
    )
  }
)
