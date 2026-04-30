// src/shared/board-ui/labelBlocks.tsx
// shared label rendering primitives — used by ItemContent (grid/board tiles)
// & the image editor preview so the visual stays pixel-identical between them

import type { CSSProperties } from 'react'

import {
  LABEL_SCRIM_CLASS,
  LABEL_SCRIM_TEXT_CLASS,
  LABEL_TEXT_COLOR_STYLE,
  captionPaddingStyle,
  labelFontStyle,
  overlayPaddingStyle,
} from './labelBlocksStyle'
import type { ResolvedLabelDisplay } from './labelDisplay'

interface OverlayLabelBlockProps
{
  display: ResolvedLabelDisplay
  // when true the block accepts pointer events & shows a grab cursor — used
  // by the image editor's draggable preview. defaults to false (read-only)
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

// content-sized absolutely-positioned block centered on the placement anchor.
// width: max-content sizes to natural caption width — without it, overflow-wrap:
// anywhere collapses the box to one character (min-content). maxWidth caps growth
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
