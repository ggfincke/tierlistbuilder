// src/app/shells/EmbedShell.tsx
// embed shell for the dedicated read-only embed route — locks classic dark theme

import { useEffect } from 'react'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { EmbedView } from '~/features/embed/ui/EmbedView'
import { applyTextStyle, applyThemeTokens } from '~/shared/theme/runtime'

export const EmbedShell = () =>
{
  useEffect(() =>
  {
    applyThemeTokens('classic')
    applyTextStyle('default')

    // restore user settings on unmount so navigation back to the workspace
    // shell doesn't flash classic/default before its useThemeApplicator fires
    return () =>
    {
      const { themeId, textStyleId } = useSettingsStore.getState()
      applyThemeTokens(themeId)
      applyTextStyle(textStyleId)
    }
  }, [])

  return <EmbedView />
}
