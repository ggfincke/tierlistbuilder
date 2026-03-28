// src/theme/tierColors.ts
// tier color source helpers — assign & remap palette-backed colors

import { PALETTES } from './palettes'
import type {
  PaletteId,
  Tier,
  TierColorSource,
  TierColorUpdate,
} from '../types'

// return the palette-backed color for a given source slot
export const getTierColorFromSource = (
  paletteId: PaletteId,
  colorSource: TierColorSource
): string | null =>
{
  const palette = PALETTES[paletteId]

  if (colorSource.paletteType === 'default')
  {
    return palette.defaults[colorSource.index] ?? null
  }

  return palette.presets[colorSource.index] ?? null
}

// return the auto-assigned source slot for a tier position
export const getAutoTierColorSource = (
  paletteId: PaletteId,
  tierIndex: number
): TierColorSource =>
{
  const palette = PALETTES[paletteId]

  if (tierIndex < palette.defaults.length)
  {
    return {
      paletteType: 'default',
      index: tierIndex,
    }
  }

  return {
    paletteType: 'preset',
    index: tierIndex % palette.presets.length,
  }
}

// resolve the auto-assigned color update for a tier position
export const getAutoTierColorUpdate = (
  paletteId: PaletteId,
  tierIndex: number
): TierColorUpdate =>
{
  const colorSource = getAutoTierColorSource(paletteId, tierIndex)

  return {
    color: getTierColorFromSource(paletteId, colorSource) ?? '#888888',
    colorSource,
  }
}

// map a tier color to the equivalent slot in another palette
export const mapTierColorToPalette = (
  targetPaletteId: PaletteId,
  tier: Tier
): TierColorUpdate | null =>
{
  if (!tier.colorSource) return null

  // follow the visible swatch order for user-picked preset colors
  if (tier.colorSource.paletteType === 'preset')
  {
    const targetColor =
      PALETTES[targetPaletteId].presets[tier.colorSource.index]
    if (targetColor)
    {
      return {
        color: targetColor,
        colorSource: tier.colorSource,
      }
    }
  }

  return {
    color:
      getTierColorFromSource(targetPaletteId, tier.colorSource) ?? tier.color,
    colorSource: tier.colorSource,
  }
}

// build a recolor map for all tiers when swapping from one palette to another
// skips tiers whose color wouldn't change (avoids no-op undo entries)
export const buildRecolorMap = (
  _sourcePaletteId: PaletteId,
  targetPaletteId: PaletteId,
  tiers: Tier[]
): Map<string, TierColorUpdate> =>
{
  const colorMap = new Map<string, TierColorUpdate>()

  for (const tier of tiers)
  {
    const colorUpdate = mapTierColorToPalette(targetPaletteId, tier)

    if (
      colorUpdate &&
      colorUpdate.color.toLowerCase() !== tier.color.toLowerCase()
    )
    {
      colorMap.set(tier.id, colorUpdate)
    }
  }

  return colorMap
}
