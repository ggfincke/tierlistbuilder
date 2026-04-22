// src/features/workspace/export/ui/StaticExportBoard.tsx
// static board renderer used by isolated export capture sessions

import { memo } from 'react'

import type {
  BoardSnapshot,
  ImageFit,
  TierItem,
} from '@/features/workspace/boards/model/contract'
import type { ExportAppearance } from '@/shared/types/export'
import { resolveTierColorSpec } from '@/shared/theme/tierColors'
import { itemSlotDimensions, SHAPE_CLASS } from '@/shared/board-ui/constants'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
} from '@/features/workspace/boards/lib/aspectRatio'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '@/shared/board-ui/BoardPrimitives'
import { ItemContent } from '@/shared/board-ui/ItemContent'

interface StaticExportItemProps
{
  item: TierItem
  appearance: ExportAppearance
  slotWidth: number
  slotHeight: number
  boardDefaultFit: ImageFit | undefined
}

const StaticExportItem = memo(
  ({
    item,
    appearance,
    slotWidth,
    slotHeight,
    boardDefaultFit,
  }: StaticExportItemProps) =>
  {
    const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)

    return (
      <div
        style={{ width: slotWidth, height: slotHeight }}
        className={`relative overflow-hidden ${SHAPE_CLASS[appearance.itemShape]}`}
      >
        <ItemContent
          item={item}
          showLabel={appearance.showLabels && !!item.label}
          fit={effectiveFit}
        />
      </div>
    )
  }
)

interface StaticExportBoardProps
{
  data: BoardSnapshot
  appearance: ExportAppearance
  backgroundColor: string
}

export const StaticExportBoard = memo(
  ({ data, appearance, backgroundColor }: StaticExportBoardProps) =>
  {
    const boardAspectRatio = getBoardItemAspectRatio(data)
    const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
      appearance.itemSize,
      boardAspectRatio
    )

    return (
      <div
        data-testid="export-board-root"
        className="min-w-[860px]"
        style={{ backgroundColor }}
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
                    if (!item)
                    {
                      return null
                    }

                    return (
                      <StaticExportItem
                        key={itemId}
                        item={item}
                        appearance={appearance}
                        slotWidth={slotWidth}
                        slotHeight={slotHeight}
                        boardDefaultFit={data.defaultItemImageFit}
                      />
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
