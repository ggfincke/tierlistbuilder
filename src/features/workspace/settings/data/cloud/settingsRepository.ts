// src/features/workspace/settings/data/cloud/settingsRepository.ts
// imperative Convex adapters for cloud settings sync — all callers live in
// the sync lifecycle layer, so no React hook wrappers are exposed

import { api } from '@convex/_generated/api'
import type {
  AppSettings,
  CloudSettingsRead,
} from '@tierlistbuilder/contracts/workspace/settings'
import { convexClient } from '~/features/platform/convex/convexClient'

// imperative one-shot fetch for the cloud merge flow & resume helpers
export const getMySettingsImperative = (): Promise<CloudSettingsRead | null> =>
  convexClient.query(api.workspace.settings.queries.getMySettings, {})

// imperative whole-document upsert. settings are last-write-wins (no
// revision check) — concurrent edits resolve to whichever debounced flush
// lands last, matching what users expect for cosmetic prefs
export const upsertMySettingsImperative = (args: {
  settings: AppSettings
}): Promise<{ updatedAt: number }> =>
  convexClient.mutation(api.workspace.settings.mutations.upsertMySettings, args)
