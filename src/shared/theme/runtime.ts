// src/shared/theme/runtime.ts
// theme runtime service - sync theme & text style tokens to the DOM

import type { TextStyleId, ThemeId } from '@tierlistbuilder/contracts/lib/theme'
import { getTextColor } from '~/shared/lib/color'
import { TEXT_STYLES } from '~/shared/theme/textStyles'
import { THEMES } from '~/shared/theme/tokens'

export const applyThemeTokens = (themeId: ThemeId): void =>
{
  const theme = THEMES[themeId]
  const root = document.documentElement

  for (const [key, value] of Object.entries(theme))
  {
    root.style.setProperty(`--t-${key}`, value)
  }

  // accent-foreground is now stored per-theme (set above via Object.entries).
  // destructive-foreground stays computed — no design intent diverges from
  // "auto-pick black or white on the destructive bg."
  root.style.setProperty(
    '--t-destructive-foreground',
    getTextColor(theme.destructive)
  )
  root.setAttribute('data-theme', themeId)
}

export const applyTextStyle = (styleId: TextStyleId): void =>
{
  const style = TEXT_STYLES[styleId]
  const root = document.documentElement

  root.style.setProperty('--ts-font-family', style.fontFamily)
  root.style.setProperty('--ts-weight-normal', style.weightNormal)
  root.style.setProperty('--ts-weight-heading', style.weightHeading)
  root.style.setProperty('--ts-letter-spacing', style.letterSpacing)
  root.setAttribute('data-text-style', styleId)
}
