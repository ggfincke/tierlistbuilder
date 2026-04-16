// src/app/shells/EmbedShell.tsx
// embed shell for the dedicated read-only embed route — locks classic dark theme

import { useEffect } from 'react'

import { EmbedView } from '~/features/workspace/sharing/ui/EmbedView'
import { applyTextStyle, applyThemeTokens } from '~/shared/theme/runtime'

export const EmbedShell = () =>
{
  useEffect(() =>
  {
    applyThemeTokens('classic')
    applyTextStyle('default')
  }, [])

  return <EmbedView />
}
