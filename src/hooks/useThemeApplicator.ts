// src/hooks/useThemeApplicator.ts
// syncs the active theme & text style from the settings store to the DOM

import { useEffect, useRef } from 'react'

import { useSettingsStore } from '../store/useSettingsStore'
import { useTierListStore } from '../store/useTierListStore'
import { THEME_PALETTE } from '../theme/palettes'
import { buildRecolorMap } from '../theme/tierColors'
import { THEMES } from '../theme/tokens'
import { TEXT_STYLES } from '../theme/textStyles'
import type { TextStyleId, ThemeId } from '../types'

// ID used for the dynamically injected Google Fonts <link> element
const FONT_LINK_ID = 'theme-google-font'

// apply all color tokens for the given theme to :root
function applyThemeTokens(themeId: ThemeId): void
{
  const theme = THEMES[themeId]
  const root = document.documentElement

  for (const [key, value] of Object.entries(theme))
  {
    root.style.setProperty(`--t-${key}`, value)
  }

  root.setAttribute('data-theme', themeId)
}

// apply typography tokens & load the font for the given text style
function applyTextStyle(styleId: TextStyleId): void
{
  const style = TEXT_STYLES[styleId]
  const root = document.documentElement

  root.style.setProperty('--ts-font-family', style.fontFamily)
  root.style.setProperty('--ts-weight-normal', style.weightNormal)
  root.style.setProperty('--ts-weight-heading', style.weightHeading)
  root.style.setProperty('--ts-letter-spacing', style.letterSpacing)
  root.setAttribute('data-text-style', styleId)

  // manage Google Fonts link element
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
  }
  else if (existing)
  {
    existing.remove()
  }
}

// hook called once in App — keeps DOM in sync w/ settings store
export function useThemeApplicator(): void
{
  const themeId = useSettingsStore((s) => s.themeId)
  const textStyleId = useSettingsStore((s) => s.textStyleId)
  const prevThemeRef = useRef<ThemeId | null>(null)

  useEffect(() =>
  {
    // swap tier colors from prev palette to new palette
    if (prevThemeRef.current !== null && prevThemeRef.current !== themeId)
    {
      const { syncTierColorsWithTheme } = useSettingsStore.getState()
      if (syncTierColorsWithTheme)
      {
        const prevPaletteId = THEME_PALETTE[prevThemeRef.current]
        const newPaletteId = THEME_PALETTE[themeId]
        const { tiers, batchRecolorTiers } = useTierListStore.getState()
        batchRecolorTiers(buildRecolorMap(prevPaletteId, newPaletteId, tiers))
      }
    }

    applyThemeTokens(themeId)
    prevThemeRef.current = themeId
  }, [themeId])

  useEffect(() =>
  {
    applyTextStyle(textStyleId)
  }, [textStyleId])
}
