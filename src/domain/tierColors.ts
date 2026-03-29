// src/domain/tierColors.ts
// canonical tier-color helpers — create, resolve, & migrate tier color specs

import { PALETTES } from '../theme/palettes'
import type {
  PaletteId,
  Tier,
  TierColorSpec,
  TierCustomColorSpec,
  TierPaletteColorSpec,
} from '../types'

const FALLBACK_COLOR = '#888888'

export const createPaletteTierColorSpec = (
  index: number
): TierPaletteColorSpec => ({
  kind: 'palette',
  index,
})

export const createCustomTierColorSpec = (
  hex: string
): TierCustomColorSpec => ({
  kind: 'custom',
  hex: normalizeHexColor(hex) ?? FALLBACK_COLOR,
})

export const getPaletteColors = (paletteId: PaletteId): string[] =>
  PALETTES[paletteId].colors

export const getTierColorFromPaletteSpec = (
  paletteId: PaletteId,
  colorSpec: TierPaletteColorSpec
): string | null => getPaletteColors(paletteId)[colorSpec.index] ?? null

export const resolveTierColorSpec = (
  paletteId: PaletteId,
  colorSpec: TierColorSpec
): string =>
{
  if (colorSpec.kind === 'custom')
  {
    return colorSpec.hex
  }

  return getTierColorFromPaletteSpec(paletteId, colorSpec) ?? FALLBACK_COLOR
}

export const resolveTierColor = (paletteId: PaletteId, tier: Tier): string =>
  resolveTierColorSpec(paletteId, tier.colorSpec)

export const getAutoTierColorSpec = (
  paletteId: PaletteId,
  tierIndex: number
): TierColorSpec =>
{
  const colorCount = getPaletteColors(paletteId).length

  if (colorCount === 0)
  {
    return createCustomTierColorSpec(FALLBACK_COLOR)
  }

  return createPaletteTierColorSpec(tierIndex % colorCount)
}

const normalizeHexColor = (value: string): string | null =>
{
  const hex = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : null
}
