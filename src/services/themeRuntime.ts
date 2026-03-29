// src/services/themeRuntime.ts
// theme runtime service — sync theme tokens & font loading to the DOM

import { THEMES } from '../theme/tokens'
import { TEXT_STYLES } from '../theme/textStyles'
import type { TextStyleId, ThemeId } from '../types'

const FONT_LINK_ID = 'theme-google-font'

export const applyThemeTokens = (themeId: ThemeId): void =>
{
  const theme = THEMES[themeId]
  const root = document.documentElement

  for (const [key, value] of Object.entries(theme))
  {
    root.style.setProperty(`--t-${key}`, value)
  }

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
