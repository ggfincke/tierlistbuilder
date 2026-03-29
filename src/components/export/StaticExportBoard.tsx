// src/components/export/StaticExportBoard.tsx
// static board renderer used by isolated export capture sessions

import { memo } from 'react'

import type {
  ExportAppearance,
  ItemSize,
  TierItem,
  TierLabelFontSize,
  TierListData,
} from '../../types'
import { getTextColor } from '../../utils/color'
import {
  ITEM_SIZE_PX,
  LABEL_WIDTH_PX,
  SHAPE_CLASS,
} from '../../utils/constants'
import { ItemContent } from '../board/ItemContent'

const LABEL_FONT_SIZE_CLASS: Record<TierLabelFontSize, string> = {
  xs: 'text-xs',
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
  xl: 'text-xl',
}

const LABEL_PADDING_CLASS: Record<ItemSize, string> = {
  small: 'px-1.5 py-1',
  medium: 'px-3 py-2',
  large: 'px-4 py-3',
}

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
  data: TierListData
  appearance: ExportAppearance
  backgroundColor: string
}

export const StaticExportBoard = memo(
  ({ data, appearance, backgroundColor }: StaticExportBoardProps) =>
  {
    const sizePx = ITEM_SIZE_PX[appearance.itemSize]
    const fontClass = LABEL_FONT_SIZE_CLASS[appearance.tierLabelFontSize]
    const weightClass = appearance.tierLabelBold
      ? 'font-semibold'
      : 'font-normal'
    const italicClass = appearance.tierLabelItalic ? 'italic' : ''

    return (
      <div
        data-testid="export-board-root"
        className="min-w-[860px]"
        style={{ backgroundColor }}
      >
        {data.tiers.map((tier, index) => (
          <div key={tier.id}>
            <div className="flex bg-[var(--t-bg-surface)] transition-colors">
              <div
                className={`flex min-w-0 flex-1 border-b border-l border-[var(--t-border)]${
                  index === 0 ? ' border-t' : ''
                }`}
              >
                <div
                  className="flex shrink-0 border-r border-[var(--t-border)]"
                  style={{
                    width: LABEL_WIDTH_PX[appearance.labelWidth],
                    minHeight: sizePx,
                    backgroundColor: tier.color,
                    color: getTextColor(tier.color),
                  }}
                >
                  <div
                    className={`flex h-full w-full items-center justify-center text-center ${LABEL_PADDING_CLASS[appearance.itemSize]} ${fontClass} ${weightClass} ${italicClass} leading-tight`}
                  >
                    <span className="block max-w-full break-words [overflow-wrap:anywhere]">
                      {tier.name}
                    </span>
                  </div>
                </div>

                <div
                  className={`flex flex-1 flex-wrap content-start bg-[var(--t-bg-surface)] p-0 ${
                    appearance.compactMode ? 'gap-0' : 'gap-px'
                  }`}
                  style={{ minHeight: sizePx }}
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
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }
)
