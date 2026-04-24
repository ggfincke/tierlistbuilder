// src/shared/theme/tierColors.ts
// canonical tier-color helpers — create, resolve, & normalize tier color specs

import { normalizeHexColor } from '../lib/color'
import { PALETTES } from './palettes'
import type {
  PaletteId,
  TierColorSpec,
  TierCustomColorSpec,
  TierPaletteColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'

export const FALLBACK_COLOR = '#888888'

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

const isPaletteColorSpec = (value: unknown): value is { index: number } =>
{
  if (!value || typeof value !== 'object')
  {
    return false
  }

  const spec = value as Record<string, unknown>

  return spec.kind === 'palette' && typeof spec.index === 'number'
}

const isCustomColorSpec = (value: unknown): value is { hex: string } =>
{
  if (!value || typeof value !== 'object')
  {
    return false
  }

  const spec = value as Record<string, unknown>

  return spec.kind === 'custom' && typeof spec.hex === 'string'
}

// validate an unknown value as a canonical TierColorSpec, or null
export const normalizeCanonicalTierColorSpec = (
  value: unknown
): TierColorSpec | null =>
{
  if (isPaletteColorSpec(value))
  {
    return createPaletteTierColorSpec(value.index)
  }

  if (isCustomColorSpec(value))
  {
    return createCustomTierColorSpec(value.hex)
  }

  return null
}

export const areTierColorSpecsEqual = (
  left: TierColorSpec | null | undefined,
  right: TierColorSpec | null | undefined
): boolean =>
{
  if (!left && !right)
  {
    return true
  }

  if (!left || !right || left.kind !== right.kind)
  {
    return false
  }

  if (left.kind === 'palette' && right.kind === 'palette')
  {
    return left.index === right.index
  }

  if (left.kind === 'custom' && right.kind === 'custom')
  {
    return left.hex === right.hex
  }

  return false
}

export const getPaletteColors = (paletteId: PaletteId): string[] =>
  (PALETTES[paletteId] ?? PALETTES.classic).colors

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
