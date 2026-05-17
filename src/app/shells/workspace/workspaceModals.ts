// src/app/shells/workspace/workspaceModals.ts
// typed payload map for workspace-owned modal state

import type { SettingsTab } from '~/features/workspace/settings/ui/BoardSettingsModal'

interface PublishRankingPayload
{
  boardExternalId: string
  defaultTitle: string
}

interface PublishTemplatePayload
{
  // active board id when invoked from the workspace; null lets the modal pick
  // its own default from the publishable-boards list
  initialBoardExternalId: string | null
}

export type WorkspaceModalPayloads = {
  settings: SettingsTab
  stats: undefined
  share: undefined
  annotation: string
  preview: string
  publishRanking: PublishRankingPayload
  publishTemplate: PublishTemplatePayload
}
