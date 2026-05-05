// src/app/shells/workspaceModals.ts
// typed payload map for workspace-owned modal state

import type { SettingsTab } from '~/features/workspace/settings/ui/BoardSettingsModal'

export interface PublishRankingPayload
{
  boardExternalId: string
  defaultTitle: string
}

export type WorkspaceModalPayloads = {
  settings: SettingsTab
  stats: undefined
  share: undefined
  annotation: string
  preview: string
  publishRanking: PublishRankingPayload
}
