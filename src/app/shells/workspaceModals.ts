// src/app/shells/workspaceModals.ts
// typed payload map for workspace-owned modal state

import type { SettingsTab } from '~/features/workspace/settings/ui/BoardSettingsModal'

export type WorkspaceModalPayloads = {
  settings: SettingsTab
  stats: undefined
  share: undefined
  annotation: string
  preview: string
}
