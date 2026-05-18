// src/app/routes/EmbedRoute.tsx
// embed route entry that locks chrome tokens for the read-only iframe view

import { EmbedView } from '~/features/embed/ui/EmbedView'
import { useLockedTheme } from '~/features/platform/preferences/model/useThemeSync'

export const EmbedRoute = () =>
{
  useLockedTheme('scoreboard', 'default')
  return <EmbedView />
}
