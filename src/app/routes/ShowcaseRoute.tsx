// src/app/routes/ShowcaseRoute.tsx
// /tier-list route — self-only tlotl editor shell

import { ShowcaseEditorPage } from '~/features/platform/showcase/pages/ShowcaseEditorPage'
import { AmbientPageShell } from '~/app/shells/AmbientPageShell'

export const ShowcaseRoute = () => (
  <AmbientPageShell>
    <ShowcaseEditorPage />
  </AmbientPageShell>
)
