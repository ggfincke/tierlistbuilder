// src/features/library/lib/resolveTierColor.ts
// resolve a TierColorSpec into a CSS hex string against a palette

import type {
  PaletteId,
  TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'

import { PALETTES } from '~/shared/theme/palettes'

// fallback when a palette index is out of range — should not happen for
// well-formed boards but keeps the UI rendering rather than throwing on a
// bad spec coming back from the server
const FALLBACK_HEX = '#888888'

export const resolveTierColor = (
  spec: TierColorSpec,
  paletteId: PaletteId
): string =>
{
  if (spec.kind === 'custom')
  {
    return spec.hex
  }
  const palette = PALETTES[paletteId]
  if (!palette) return FALLBACK_HEX
  const color = palette.colors[spec.index]
  return color ?? FALLBACK_HEX
}
