// src/shared/board-ui/labelBlocksStyle.ts
// shared style helpers for label rendering primitives — kept separate from
// labelBlocks.tsx so fast-refresh stays component-only

import type { CSSProperties } from 'react'

import { TEXT_STYLES } from '~/shared/theme/textStyles'
import type { LabelTextColor } from '@tierlistbuilder/contracts/workspace/board'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type { ResolvedLabelDisplay } from './labelDisplay'

export const LABEL_SCRIM_CLASS = {
  none: '',
  dark: 'bg-black/60',
  light: 'bg-white/70',
} as const

export const LABEL_SCRIM_TEXT_CLASS = {
  none: 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]',
  dark: 'text-white',
  light: 'text-[rgb(20,20,20)]',
} as const

// overlay text color palette — 'auto' inherits the scrim text color (white
// on dark/none, black on light). other values force an explicit hex via
// inline style so the scrim text class color is overridden cleanly
export const LABEL_TEXT_COLOR_HEX: Record<LabelTextColor, string | undefined> =
  {
    auto: undefined,
    white: '#ffffff',
    black: '#141414',
    red: '#ef4444',
    orange: '#f59e0b',
    yellow: '#facc15',
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#a855f7',
  }

export const LABEL_TEXT_COLOR_STYLE = Object.fromEntries(
  Object.entries(LABEL_TEXT_COLOR_HEX).map(([color, hex]) => [
    color,
    hex ? { color: hex } : undefined,
  ])
) as Record<LabelTextColor, CSSProperties | undefined>

const LABEL_FONT_STYLES = Object.fromEntries(
  Object.entries(TEXT_STYLES).map(([id, style]) => [
    id,
    {
      fontFamily: style.fontFamily,
      letterSpacing: style.letterSpacing,
    },
  ])
) as Record<TextStyleId, CSSProperties>

const captionPaddingCache = new Map<number, CSSProperties>()
const overlayPaddingCache = new Map<number, CSSProperties>()

const paddingKey = (fontSizePx: number): number =>
  Number.isFinite(fontSizePx) ? Number(fontSizePx.toFixed(2)) : 0

export const captionPaddingStyle = (fontSizePx: number): CSSProperties =>
{
  const key = paddingKey(fontSizePx)
  const cached = captionPaddingCache.get(key)
  if (cached) return cached
  const style = {
    paddingInline: `${Math.max(2, Math.round(fontSizePx * 0.35))}px`,
    paddingBlock: `${Math.max(1, Math.round(fontSizePx * 0.12))}px`,
  }
  captionPaddingCache.set(key, style)
  return style
}

export const overlayPaddingStyle = (fontSizePx: number): CSSProperties =>
{
  const key = paddingKey(fontSizePx)
  const cached = overlayPaddingCache.get(key)
  if (cached) return cached
  const style = {
    paddingInline: `${Math.max(2, Math.round(fontSizePx * 0.4))}px`,
    paddingBlock: `${Math.max(1, Math.round(fontSizePx * 0.15))}px`,
  }
  overlayPaddingCache.set(key, style)
  return style
}

// inline font override — undefined textStyleId inherits from the parent
// (page-level font) so callers without a per-label override don't reset
export const labelFontStyle = (
  textStyleId: ResolvedLabelDisplay['textStyleId']
): CSSProperties | undefined =>
{
  if (!textStyleId) return undefined
  return LABEL_FONT_STYLES[textStyleId]
}
