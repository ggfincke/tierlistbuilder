// src/app/shells/EmbedShell.tsx
// embed shell — locks Scoreboard chrome tokens so embedded boards render
// consistently regardless of visitor preferences (we don't pipe host prefs).

import { useLockedTheme } from '~/features/platform/preferences/model/useThemeSync'
import { EmbedView } from '~/features/embed/ui/EmbedView'

export const EmbedShell = () =>
{
  useLockedTheme('scoreboard', 'default')
  return <EmbedView />
}
