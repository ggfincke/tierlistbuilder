// src/features/workspace/export/ui/StaticExportBoard.tsx
// static board renderer used by isolated export capture sessions

import { memo } from 'react'

import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance } from '../model/runtime'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { ITEM_SIZE_PX, SHAPE_CLASS } from '~/shared/board-ui/constants'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '~/shared/board-ui/BoardPrimitives'
import { ItemContent } from '~/shared/board-ui/ItemContent'

interface StaticExportItemProps
{
  item: TierItem
  appearance: ExportAppearance
}

const StaticExportItem = memo(({ item, appearance }: StaticExportItemProps) =>
{
  const sizePx = ITEM_SIZE_PX[appearance.itemSize]

  return (
    <div
      style={{ width: sizePx, height: sizePx }}
      className={`relative overflow-hidden ${SHAPE_CLASS[appearance.itemShape]}`}
    >
      <ItemContent
        item={item}
        showLabel={appearance.showLabels && !!item.label}
      />
    </div>
  )
})

interface StaticExportBoardProps
{
  data: BoardSnapshot
  appearance: ExportAppearance
  backgroundColor: string
}

export const StaticExportBoard = memo(
  ({ data, appearance, backgroundColor }: StaticExportBoardProps) =>
  {
    const sizePx = ITEM_SIZE_PX[appearance.itemSize]

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
                  minHeightPx={sizePx}
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
