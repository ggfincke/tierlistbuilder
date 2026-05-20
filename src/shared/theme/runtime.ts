// src/shared/theme/runtime.ts
// theme runtime service — sync theme tokens & font loading to the DOM

import type { TextStyleId, ThemeId } from '@tierlistbuilder/contracts/lib/theme'
import type { MediaPlate } from '@tierlistbuilder/contracts/workspace/board'
import { getTextColor } from '~/shared/lib/color'
import { TEXT_STYLES } from '~/shared/theme/textStyles'
import { THEMES } from '~/shared/theme/tokens'

const FONT_LINK_ID = 'theme-google-font'

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

// write (or clear) a user override for a transparent-logo plate. set inline on
// <html> so it wins over the per-theme default & survives theme swaps — those
// only rewrite --t-media-plate-*-default, never the -user var
export const applyMediaPlateOverride = (
  variant: MediaPlate,
  color: string | null
): void =>
{
  const property = `--t-media-plate-${variant}-user`
  const root = document.documentElement
  if (color)
  {
    root.style.setProperty(property, color)
  }
  else
  {
    root.style.removeProperty(property)
  }
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

  const existing = document.getElementById(FONT_LINK_ID)

  if (style.googleFontsUrl)
  {
    if (
      existing instanceof HTMLLinkElement &&
      existing.href === style.googleFontsUrl
    )
    {
      return
    }

    if (existing)
    {
      existing.remove()
    }

    const link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = style.googleFontsUrl
    document.head.appendChild(link)
    return
  }

  if (existing)
  {
    existing.remove()
  }
}
