// src/features/platform/preferences/model/useThemeSync.ts
// sync theme/text-style/reduced-motion from preferences to DOM runtime

import { useEffect } from 'react'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import type { ThemeId, TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import { applyTextStyle, applyThemeTokens } from '~/shared/theme/runtime'

// keep DOM theme runtime in sync w/ preferences — call once in each app shell.
// reads only user-default preferences so non-workspace surfaces (e.g. Marketplace)
// don't pick up a stale per-board override from the last loaded board
interface ThemeSyncOptions
{
  syncTextStyle?: boolean
}

export function useThemeSync({
  syncTextStyle = true,
}: ThemeSyncOptions = {}): void
{
  const themeId = usePreferencesStore((s) => s.themeId)
  const textStyleId = usePreferencesStore((s) => s.textStyleId)
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion)

  useEffect(() =>
  {
    applyThemeTokens(themeId)
  }, [themeId])

  useEffect(() =>
  {
    if (!syncTextStyle) return
    applyTextStyle(textStyleId)
  }, [syncTextStyle, textStyleId])

  useEffect(() =>
  {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion)
  }, [reducedMotion])
}

// apply a fixed theme/text-style once & ignore preferences changes. restores the
// user's preference-driven theme on unmount so navigating away doesn't strand
// the locked pair (e.g. /embed -> /)
export function useLockedTheme(
  themeId: ThemeId,
  textStyleId: TextStyleId
): void
{
  useEffect(() =>
  {
    applyThemeTokens(themeId)
    applyTextStyle(textStyleId)

    return () =>
    {
      const next = usePreferencesStore.getState()
      applyThemeTokens(next.themeId)
      applyTextStyle(next.textStyleId)
    }
  }, [themeId, textStyleId])
}
