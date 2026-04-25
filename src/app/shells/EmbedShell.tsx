// src/app/shells/EmbedShell.tsx
// embed shell for the dedicated read-only embed route — locks classic dark theme

import { useLockedTheme } from '~/app/bootstrap/useThemeSync'
import { EmbedView } from '~/features/embed/ui/EmbedView'

export const EmbedShell = () =>
{
  useLockedTheme('classic', 'default')
  return <EmbedView />
}
