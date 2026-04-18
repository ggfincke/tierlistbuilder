// src/shared/theme/textStyles.ts
// text style definitions — font family, weights, & letter spacing per style

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import { buildGoogleFontUrl } from '~/shared/lib/urls'

export interface TextStyleDefinition
{
  fontFamily: string
  weightNormal: string
  weightHeading: string
  letterSpacing: string
  // Google Fonts URL to load (null for system/already-available fonts)
  googleFontsUrl: string | null
}

export const TEXT_STYLES: Record<TextStyleId, TextStyleDefinition> = {
  default: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    weightNormal: '400',
    weightHeading: '600',
    letterSpacing: '-0.011em',
    googleFontsUrl: null,
  },
  mono: {
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace",
    weightNormal: '400',
    weightHeading: '700',
    letterSpacing: '-0.02em',
    googleFontsUrl: buildGoogleFontUrl('JetBrains Mono', '400;700'),
  },
  serif: {
    fontFamily: "'Source Serif 4', 'Georgia', 'Times New Roman', serif",
    weightNormal: '400',
    weightHeading: '700',
    letterSpacing: '0em',
    googleFontsUrl: buildGoogleFontUrl('Source Serif 4', '400;700'),
  },
  rounded: {
    fontFamily: "'Nunito', 'Varela Round', 'Quicksand', system-ui, sans-serif",
    weightNormal: '400',
    weightHeading: '700',
    letterSpacing: '0.01em',
    googleFontsUrl: buildGoogleFontUrl('Nunito', '400;700'),
  },
  display: {
    fontFamily: "'Outfit', 'Poppins', 'Montserrat', system-ui, sans-serif",
    weightNormal: '500',
    weightHeading: '800',
    letterSpacing: '-0.025em',
    googleFontsUrl: buildGoogleFontUrl('Outfit', '500;800'),
  },
}
