// src/theme/tierColors.ts
// tier color source helpers — assign, infer, hydrate, & remap palette-backed colors

import { PALETTES } from './palettes'
import type {
  PaletteId,
  Tier,
  TierColorSource,
  TierColorUpdate,
} from '../types'

const getSourceKey = (colorSource: TierColorSource): string =>
  `${colorSource.paletteType}:${colorSource.index}`

const areColorSourcesEqual = (
  left?: TierColorSource | null,
  right?: TierColorSource | null
): boolean =>
{
  if (!left && !right)
  {
    return true
  }

  if (!left || !right)
  {
    return false
  }

  return left.paletteType === right.paletteType && left.index === right.index
}

// return the palette-backed color for a given source slot
export const getTierColorFromSource = (
  paletteId: PaletteId,
  colorSource: TierColorSource
): string | null =>
{
  const palette = PALETTES[paletteId]

  if (colorSource.paletteType === 'default')
  {
    return palette.defaults[colorSource.index]?.color ?? null
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

const getMatchesForPalette = (
  paletteId: PaletteId,
  color: string
): TierColorSource[] =>
{
  const normalized = color.toLowerCase()
  const palette = PALETTES[paletteId]
  const matches: TierColorSource[] = []

  for (let i = 0; i < palette.defaults.length; i++)
  {
    if (palette.defaults[i].color.toLowerCase() === normalized)
    {
      matches.push({
        paletteType: 'default',
        index: i,
      })
    }
  }

  for (let i = 0; i < palette.presets.length; i++)
  {
    if (palette.presets[i].toLowerCase() === normalized)
    {
      matches.push({
        paletteType: 'preset',
        index: i,
      })
    }
  }

  return matches
}

const getAllMatches = (
  color: string,
  preferredPaletteId?: PaletteId
): TierColorSource[] =>
{
  const paletteIds = Object.keys(PALETTES) as PaletteId[]
  const orderedPaletteIds = preferredPaletteId
    ? [
        preferredPaletteId,
        ...paletteIds.filter((paletteId) => paletteId !== preferredPaletteId),
      ]
    : paletteIds
  const matches = new Map<string, TierColorSource>()

  for (const paletteId of orderedPaletteIds)
  {
    for (const colorSource of getMatchesForPalette(paletteId, color))
    {
      matches.set(getSourceKey(colorSource), colorSource)
    }
  }

  return [...matches.values()]
}

// infer the source slot for a tier color when metadata is missing or stale
export const resolveTierColorSource = (
  paletteId: PaletteId,
  tier: Tier,
  tierIndex: number
): TierColorSource | null =>
{
  const normalizedColor = tier.color.toLowerCase()

  if (tier.colorSource)
  {
    const sourceColor = getTierColorFromSource(paletteId, tier.colorSource)
    if (sourceColor?.toLowerCase() === normalizedColor)
    {
      return tier.colorSource
    }
  }

  const autoSource = getAutoTierColorSource(paletteId, tierIndex)
  const autoColor = getTierColorFromSource(paletteId, autoSource)
  if (autoColor?.toLowerCase() === normalizedColor)
  {
    return autoSource
  }

  const preferredMatches = getMatchesForPalette(paletteId, tier.color)
  if (preferredMatches.length === 1)
  {
    return preferredMatches[0]
  }

  const matches = getAllMatches(tier.color, paletteId)
  if (matches.length === 0)
  {
    return null
  }

  if (matches.length === 1)
  {
    return matches[0]
  }

  return (
    matches.find((colorSource) => colorSource.paletteType === 'preset') ??
    matches[0]
  )
}

// hydrate every tier w/ a stable color source for future theme swaps
export const hydrateTierColorSources = (
  paletteId: PaletteId,
  tiers: Tier[]
): Tier[] =>
{
  return tiers.map((tier, index) =>
  {
    const colorSource = resolveTierColorSource(paletteId, tier, index)

    if (areColorSourcesEqual(tier.colorSource, colorSource))
    {
      return tier
    }

    return {
      ...tier,
      colorSource,
    }
  })
}

// build a recolor map for all tiers when swapping from one palette to another
// skips tiers whose color wouldn't change (avoids no-op undo entries)
export const buildRecolorMap = (
  sourcePaletteId: PaletteId,
  targetPaletteId: PaletteId,
  tiers: Tier[]
): Map<string, TierColorUpdate> =>
{
  const colorMap = new Map<string, TierColorUpdate>()

  for (let i = 0; i < tiers.length; i++)
  {
    const colorUpdate = mapTierColorToPalette(
      sourcePaletteId,
      targetPaletteId,
      tiers[i],
      i
    )

    if (
      colorUpdate &&
      colorUpdate.color.toLowerCase() !== tiers[i].color.toLowerCase()
    )
    {
      colorMap.set(tiers[i].id, colorUpdate)
    }
  }

  return colorMap
}

// map a tier color from one palette to the same slot in another palette
export const mapTierColorToPalette = (
  sourcePaletteId: PaletteId,
  targetPaletteId: PaletteId,
  tier: Tier,
  tierIndex: number
): TierColorUpdate | null =>
{
  const colorSource = resolveTierColorSource(sourcePaletteId, tier, tierIndex)
  if (!colorSource)
  {
    return null
  }

  const sourceColor = getTierColorFromSource(sourcePaletteId, colorSource)
  if (!sourceColor)
  {
    return null
  }

  // follow the visible swatch order only for user-picked preset colors
  if (colorSource.paletteType === 'preset')
  {
    const sourcePresetIndex = PALETTES[sourcePaletteId].presets.findIndex(
      (color) => color.toLowerCase() === sourceColor.toLowerCase()
    )

    if (sourcePresetIndex >= 0)
    {
      const targetPresetColor =
        PALETTES[targetPaletteId].presets[sourcePresetIndex]
      if (targetPresetColor)
      {
        return {
          color: targetPresetColor,
          colorSource: {
            paletteType: 'preset',
            index: sourcePresetIndex,
          },
        }
      }
    }
  }

  return {
    color: getTierColorFromSource(targetPaletteId, colorSource) ?? sourceColor,
    colorSource,
  }
}
