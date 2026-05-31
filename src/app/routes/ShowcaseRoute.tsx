// src/app/routes/ShowcaseRoute.tsx
// /tier-list route — self-only tlotl editor shell

import { ShowcaseEditorPage } from '~/features/platform/showcase/ui/ShowcaseEditorPage'
import { AmbientPageShell } from '~/shared/ui/AmbientPageShell'

export const ShowcaseRoute = () => (
  <AmbientPageShell>
    <ShowcaseEditorPage />
  </AmbientPageShell>
)
