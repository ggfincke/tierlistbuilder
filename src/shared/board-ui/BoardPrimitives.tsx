// src/shared/board-ui/BoardPrimitives.tsx
// shared presentational board primitives for live rows & static export rows

import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'

import { ITEM_SIZE_PX, LABEL_WIDTH_PX } from './constants'
import type {
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '@/shared/types/settings'
import { getTextColor } from '../lib/color'

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

interface BoardRowContentProps
{
  index: number
  children: ReactNode
}

export const BoardRowContent = ({ index, children }: BoardRowContentProps) => (
  <div
    className={`flex min-w-0 flex-1 border-b border-l border-[var(--t-border)]${
      index === 0 ? ' border-t' : ''
    }`}
  >
    {children}
  </div>
)

interface BoardRowSurfaceProps
{
  children: ReactNode
  className?: string
}

export const BoardRowSurface = ({
  children,
  className,
}: BoardRowSurfaceProps) => (
  <div
    className={`flex bg-[var(--t-bg-surface)] transition-colors${
      className ? ` ${className}` : ''
    }`}
  >
    {children}
  </div>
)

interface BoardItemsGridProps extends HTMLAttributes<HTMLDivElement>
{
  compactMode: boolean
  minHeightPx: number
}

export const BoardItemsGrid = forwardRef(function BoardItemsGrid(
  { compactMode, minHeightPx, className, ...props }: BoardItemsGridProps,
  ref: Ref<HTMLDivElement>
)
{
  return (
    <div
      ref={ref}
      {...props}
      className={`flex flex-1 flex-wrap content-start bg-[var(--t-bg-surface)] p-0 ${
        compactMode ? 'gap-0' : 'gap-px'
      }${className ? ` ${className}` : ''}`}
      style={{ minHeight: minHeightPx, ...props.style }}
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
