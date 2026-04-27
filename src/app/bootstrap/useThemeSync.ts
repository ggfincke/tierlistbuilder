// src/app/bootstrap/useThemeSync.ts
// ongoing sync of theme/text-style/reduced-motion from settings to DOM runtime,
// plus a one-shot lock hook for shells that never want to react to settings

import { useEffect } from 'react'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import type { ThemeId, TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import { applyTextStyle, applyThemeTokens } from '~/shared/theme/runtime'
import { useCurrentTextStyleId } from '~/features/workspace/settings/model/useCurrentTextStyleId'

// keep DOM theme runtime in sync w/ settings — call once in the workspace shell.
// reads only user-default settings so non-workspace surfaces (e.g. Marketplace)
// don't pick up a stale per-board override from the last loaded board
interface ThemeSyncOptions
{
  syncTextStyle?: boolean
}

export function useThemeSync({
  syncTextStyle = true,
}: ThemeSyncOptions = {}): void
{
  const themeId = useSettingsStore((s) => s.themeId)
  const textStyleId = useSettingsStore((s) => s.textStyleId)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

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

// layer the active-board text-style override on top of useThemeSync.
// workspace-only; marketplace & embed stay on the user default.
export function useBoardThemeOverrides(): void
{
  const textStyleId = useCurrentTextStyleId()

  useEffect(() =>
  {
    applyTextStyle(textStyleId)
  }, [textStyleId])
}

// apply a fixed theme/text-style once & ignore settings changes. restores the
// user's settings-driven theme on unmount so navigating away doesn't strand
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
      const next = useSettingsStore.getState()
      applyThemeTokens(next.themeId)
      applyTextStyle(next.textStyleId)
    }
  }, [themeId, textStyleId])
}
