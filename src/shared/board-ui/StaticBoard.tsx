// src/shared/board-ui/StaticBoard.tsx
// read-only board renderer shared between export capture & embed iframe

import { memo, type CSSProperties } from 'react'
import type { ReactNode } from 'react'

import type {
  BoardSnapshot,
  LabelPlacementMode,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  PaletteId,
  TextStyleId,
} from '@tierlistbuilder/contracts/lib/theme'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/platform/preferences'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
} from '~/shared/board-ui/aspectRatio'
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
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { TEXT_STYLES } from '~/shared/theme/textStyles'
import { getWrappedItemsGridStyle } from '~/shared/board-ui/wrappedItemsGrid'

export interface StaticBoardAppearance
{
  itemSize: ItemSize
  showLabels: boolean
  // fallback placement applied when neither item nor board pins one. embeds
  // can pass 'overlay' to mirror the legacy default; export passes through
  // the owner's preference
  defaultLabelPlacementMode: LabelPlacementMode
  // fallback caption font size in CSS px when neither item nor board pins one
  defaultLabelFontSizePx: number
  itemShape: ItemShape
  compactMode: boolean
  maxItemsPerRow?: number | null
  labelWidth: LabelWidth
  paletteId: PaletteId
  textStyleId: TextStyleId
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
  imageLoading?: 'eager' | 'lazy'
  'data-testid'?: string
}

export const StaticBoard = memo(
  ({
    data,
    appearance,
    backgroundColor,
    className,
    imageLoading,
    'data-testid': testId,
  }: StaticBoardProps) =>
  {
    const boardAspectRatio = getBoardItemAspectRatio(data)
    const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
      appearance.itemSize,
      boardAspectRatio
    )
    const boardDefaultFit = data.defaultItemImageFit
    const paletteId = data.paletteId ?? appearance.paletteId
    const textStyle = TEXT_STYLES[data.textStyleId ?? appearance.textStyleId]
    const style: CSSProperties = {
      ...(backgroundColor ? { backgroundColor } : {}),
      fontFamily: textStyle.fontFamily,
    }

    return (
      <div data-testid={testId} className={className} style={style}>
        {data.tiers.map((tier, index) =>
        {
          const rowBg = tier.rowColorSpec
            ? resolveTierColorSpec(paletteId, tier.rowColorSpec)
            : null

          return (
            <BoardRowSurface key={tier.id} backgroundOverride={rowBg}>
              <BoardRowContent index={index}>
                <BoardLabelCellFrame
                  color={resolveTierColorSpec(paletteId, tier.colorSpec)}
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
                  style={getWrappedItemsGridStyle({
                    compactMode: appearance.compactMode,
                    maxItemsPerRow: appearance.maxItemsPerRow,
                    slotWidth,
                  })}
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
                          autoPlate={data.autoPlate}
                          defaultItemImagePadding={data.defaultItemImagePadding}
                          label={resolveLabelDisplay({
                            itemLabel: item.label,
                            itemOptions: item.labelOptions,
                            boardSettings: data.labels,
                            globalLabelDefaults: {
                              showLabels: appearance.showLabels,
                              placementMode:
                                appearance.defaultLabelPlacementMode,
                              fontSizePx: appearance.defaultLabelFontSizePx,
                            },
                          })}
                          fit={getEffectiveImageFit(item, boardDefaultFit)}
                          frameAspectRatio={boardAspectRatio}
                          imageLoading={imageLoading}
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
