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
  paletteType: TierPaletteColorSpec['paletteType'],
  index: number
): TierPaletteColorSpec => ({
  kind: 'palette',
  paletteType,
  index,
})

export const createCustomTierColorSpec = (
  hex: string
): TierCustomColorSpec => ({
  kind: 'custom',
  hex: normalizeHexColor(hex) ?? FALLBACK_COLOR,
})

export const getTierColorFromPaletteSpec = (
  paletteId: PaletteId,
  colorSpec: TierPaletteColorSpec
): string | null =>
{
  const palette = PALETTES[paletteId]

  if (colorSpec.paletteType === 'default')
  {
    return palette.defaults[colorSpec.index] ?? null
  }

  return palette.presets[colorSpec.index] ?? null
}

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
  const palette = PALETTES[paletteId]

  if (tierIndex < palette.defaults.length)
  {
    return createPaletteTierColorSpec('default', tierIndex)
  }

  return createPaletteTierColorSpec(
    'preset',
    tierIndex % palette.presets.length
  )
}

const normalizeHexColor = (value: string): string | null =>
{
  const hex = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : null
}
