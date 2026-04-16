// src/app/bootstrap/useThemeApplicator.ts
// sync the active theme & text style from settings to DOM runtime services

import { useEffect } from 'react'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { applyTextStyle, applyThemeTokens } from '~/shared/theme/runtime'

// hook called once in App — keeps DOM theme runtime in sync w/ settings
export function useThemeApplicator(): void
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
    applyTextStyle(textStyleId)
  }, [textStyleId])

  useEffect(() =>
  {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion)
  }, [reducedMotion])
}
