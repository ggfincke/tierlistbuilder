// src/shared/board-ui/labels/labelBlocks.tsx
// shared label primitives for board tiles & image editor preview

import type { CSSProperties } from 'react'

import {
  LABEL_SCRIM_CLASS,
  LABEL_SCRIM_TEXT_CLASS,
  LABEL_TEXT_COLOR_STYLE,
  captionPaddingStyle,
  labelFontStyle,
  overlayPaddingStyle,
} from '~/shared/board-ui/labels/labelBlocksStyle'
import type { ResolvedLabelDisplay } from '~/shared/board-ui/labels/labelDisplay'

interface OverlayLabelBlockProps
{
  display: ResolvedLabelDisplay
  // enable pointer events & grab cursor for draggable editor previews
  interactive?: boolean
  // optional outer wrapper styles & event handlers for the draggable preview
  extraStyle?: CSSProperties
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>
  onPointerCancel?: React.PointerEventHandler<HTMLDivElement>
  role?: string
  ariaLabel?: string
  tabIndex?: number
}

// max-content preserves natural caption width; maxWidth caps growth
export const OverlayLabelBlock = ({
  display,
  interactive = false,
  extraStyle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  role,
  ariaLabel,
  tabIndex,
}: OverlayLabelBlockProps) =>
{
  if (display.placement.mode !== 'overlay') return null
  const { x, y } = display.placement
  const fontStyle = labelFontStyle(display.textStyleId)
  const interactionClass = interactive
    ? 'cursor-grab select-none'
    : 'pointer-events-none'
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`absolute rounded ${interactionClass} ${LABEL_SCRIM_CLASS[display.scrim]}`}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: 'max-content',
        maxWidth: '95%',
        ...overlayPaddingStyle(display.fontSizePx),
        ...extraStyle,
      }}
    >
      <span
        className={`block text-center ${LABEL_SCRIM_TEXT_CLASS[display.scrim]} [overflow-wrap:anywhere]`}
        style={{
          fontSize: `${display.fontSizePx}px`,
          lineHeight: 1.15,
          ...fontStyle,
          ...LABEL_TEXT_COLOR_STYLE[display.textColor],
        }}
      >
        {display.text}
      </span>
    </div>
  )
}

interface CaptionStripProps
{
  display: ResolvedLabelDisplay
}

export const CaptionStrip = ({ display }: CaptionStripProps) => (
  <div
    className="shrink-0 bg-[var(--t-bg-surface)]"
    style={captionPaddingStyle(display.fontSizePx)}
  >
    <span
      className="block truncate text-center font-medium text-[var(--t-text)]"
      style={{
        fontSize: `${display.fontSizePx}px`,
        lineHeight: 1.15,
        ...labelFontStyle(display.textStyleId),
      }}
    >
      {display.text}
    </span>
  </div>
)
