// src/features/workspace/settings/model/useBoardThemeOverrides.ts
// layer active-board text-style overrides on top of platform theme sync

import { useEffect } from 'react'

import { applyTextStyle } from '~/shared/theme/runtime'
import { useCurrentTextStyleId } from '~/features/workspace/settings/model/useCurrentTextStyleId'

export function useBoardThemeOverrides(): void
{
  const textStyleId = useCurrentTextStyleId()

  useEffect(() =>
  {
    applyTextStyle(textStyleId)
  }, [textStyleId])
}
