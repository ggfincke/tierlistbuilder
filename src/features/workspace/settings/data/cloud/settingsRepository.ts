// src/features/workspace/settings/data/cloud/settingsRepository.ts
// Convex query/mutation adapters for cloud settings sync. matches the
// boards/data/cloud/boardRepository pattern: hook-based wrappers for React
// components, *Imperative variants for non-React sync logic (useCloudSync,
// first-login merge, pendingSyncRecovery)

import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import { convexClient } from '~/features/platform/backend/convexClient'

// reactive read of the caller's cloud settings. returns null when
// unauthenticated, when no row exists yet, or while the query is loading.
// callers must distinguish "loading" via undefined from "no row" via null
export const useMySettings = (
  enabled: boolean
): AppSettings | null | undefined =>
  useQuery(api.workspace.settings.queries.getMySettings, enabled ? {} : 'skip')

// imperative one-shot fetch for the cloud merge flow & resume helpers
export const getMySettingsImperative = (): Promise<AppSettings | null> =>
  convexClient.query(api.workspace.settings.queries.getMySettings, {})

// imperative whole-document upsert. settings are last-write-wins (no
// revision check) — concurrent edits resolve to whichever debounced flush
// lands last, matching what users expect for cosmetic prefs
export const upsertMySettingsImperative = (args: {
  settings: AppSettings
}): Promise<{ updatedAt: number }> =>
  convexClient.mutation(api.workspace.settings.mutations.upsertMySettings, args)
