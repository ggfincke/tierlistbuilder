// src/shared/board-ui/BoardPrimitives.tsx
// shared presentational board primitives for live rows & static export rows

import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'

import {
  ITEM_SIZE_PX,
  LABEL_FONT_SIZE_CLASS,
  LABEL_PADDING_CLASS,
  LABEL_WIDTH_PX,
} from './constants'
import type {
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@tierlistbuilder/contracts/workspace/settings'
import { getTextColor } from '../lib/color'
import { joinClassNames } from '../lib/className'

interface BoardRowContentProps
{
  index: number
  children: ReactNode
}

export const BoardRowContent = ({ index, children }: BoardRowContentProps) => (
  <div
    className={joinClassNames(
      'flex min-w-0 flex-1 border-b border-l border-[var(--t-border)]',
      index === 0 && 'border-t'
    )}
  >
    {children}
  </div>
)

interface BoardRowSurfaceProps
{
  children: ReactNode
  className?: string
  // explicit row background override — leaves the theme surface token in
  // place when absent, so untouched rows still pick up theme changes
  backgroundOverride?: string | null
}

export const BoardRowSurface = ({
  children,
  className,
  backgroundOverride,
}: BoardRowSurfaceProps) => (
  <div
    className={joinClassNames(
      'flex transition-colors',
      backgroundOverride ? '' : 'bg-[var(--t-bg-surface)]',
      className
    )}
    style={
      backgroundOverride ? { backgroundColor: backgroundOverride } : undefined
    }
  >
    {children}
  </div>
)

interface BoardItemsGridProps extends HTMLAttributes<HTMLDivElement>
{
  compactMode: boolean
  minHeightPx: number
  // explicit grid background override — applied alongside the row surface
  // override so the grid cell doesn't paint the theme color on top
  backgroundOverride?: string | null
}

export const BoardItemsGrid = forwardRef(function BoardItemsGrid(
  {
    compactMode,
    minHeightPx,
    backgroundOverride,
    className,
    style,
    ...props
  }: BoardItemsGridProps,
  ref: Ref<HTMLDivElement>
)
{
  return (
    <div
      ref={ref}
      {...props}
      className={joinClassNames(
        'flex flex-1 flex-wrap content-start p-0',
        backgroundOverride ? '' : 'bg-[var(--t-bg-surface)]',
        compactMode ? 'gap-0' : 'gap-px',
        className
      )}
      style={{
        ...style,
        minHeight: minHeightPx,
        ...(backgroundOverride ? { backgroundColor: backgroundOverride } : {}),
      }}
    />
  )
})

interface BoardLabelCellFrameProps
{
  color: string
  itemSize: ItemSize
  labelWidth: LabelWidth
  tierLabelBold: boolean
  tierLabelItalic: boolean
  tierLabelFontSize: TierLabelFontSize
  children: ReactNode
}

// tier description subtitle — shared across live label, locked label, & export
export const TierDescriptionSubtitle = ({
  description,
}: {
  description?: string
}) =>
  !description ? null : (
    <span className="mt-0.5 block max-w-full break-words text-[0.65rem] leading-tight opacity-70 [overflow-wrap:anywhere]">
      {description}
    </span>
  )

export const BoardLabelCellFrame = ({
  color,
  itemSize,
  labelWidth,
  tierLabelBold,
  tierLabelItalic,
  tierLabelFontSize,
  children,
}: BoardLabelCellFrameProps) =>
{
  const fontClass = LABEL_FONT_SIZE_CLASS[tierLabelFontSize]
  const weightClass = tierLabelBold ? 'font-semibold' : 'font-normal'
  const italicClass = tierLabelItalic ? 'italic' : ''

  return (
    <div
      className="flex shrink-0 border-r border-[var(--t-border)] transition-[filter,box-shadow] hover:brightness-[1.04] focus-within:brightness-[1.04] focus-within:shadow-[inset_0_0_0_2px_rgba(var(--t-overlay),0.16)]"
      style={{
        width: LABEL_WIDTH_PX[labelWidth],
        minHeight: ITEM_SIZE_PX[itemSize],
        backgroundColor: color,
        color: getTextColor(color),
      }}
    >
      <div
        className={`flex h-full w-full items-center justify-center ${LABEL_PADDING_CLASS[itemSize]} text-center ${fontClass} ${weightClass} ${italicClass} leading-tight`}
      >
        {children}
      </div>
    </div>
  )
}
