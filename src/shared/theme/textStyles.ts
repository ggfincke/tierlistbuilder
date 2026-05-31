// src/shared/theme/textStyles.ts
// text style definitions - font family, weights, & letter spacing per style

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type { TextStyleDefinition } from '@tierlistbuilder/contracts/lib/themeDefinition'

export const TEXT_STYLES: Record<TextStyleId, TextStyleDefinition> = {
  default: {
    fontFamily:
      "'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif",
    weightNormal: '400',
    weightHeading: '600',
    letterSpacing: '-0.011em',
  },
  mono: {
    fontFamily:
      "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'SF Mono', ui-monospace, monospace",
    weightNormal: '400',
    weightHeading: '700',
    letterSpacing: '-0.02em',
  },
  serif: {
    fontFamily:
      "'Source Serif 4 Variable', 'Source Serif 4', 'Georgia', 'Times New Roman', serif",
    weightNormal: '400',
    weightHeading: '700',
    letterSpacing: '0em',
  },
  rounded: {
    fontFamily:
      "'Nunito Variable', 'Nunito', 'Varela Round', 'Quicksand', system-ui, sans-serif",
    weightNormal: '400',
    weightHeading: '700',
    letterSpacing: '0.01em',
  },
  display: {
    fontFamily:
      "'Outfit Variable', 'Outfit', 'Poppins', 'Montserrat', system-ui, sans-serif",
    weightNormal: '500',
    weightHeading: '800',
    letterSpacing: '-0.025em',
  },
}
