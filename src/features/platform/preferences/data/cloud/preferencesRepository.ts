// src/features/platform/preferences/data/cloud/preferencesRepository.ts
// imperative Convex adapters for cloud preferences sync

import { api } from '@convex/_generated/api'
import type {
  AppPreferences,
  CloudPreferencesRead,
} from '@tierlistbuilder/contracts/platform/preferences'
import { getConvexClient } from '~/features/platform/sync/lib/convexClient'

// imperative one-shot fetch for the cloud merge flow & resume helpers
export const getMyPreferencesImperative =
  (): Promise<CloudPreferencesRead | null> =>
    getConvexClient().query(
      api.platform.preferences.queries.getMyPreferences,
      {}
    )

// imperative whole-document upsert. preferences are last-write-wins (no
// revision check) — concurrent edits resolve to whichever debounced flush
// lands last, matching what users expect for cosmetic prefs
export const upsertMyPreferencesImperative = (args: {
  preferences: AppPreferences
}): Promise<{ updatedAt: number }> =>
  getConvexClient().mutation(
    api.platform.preferences.mutations.upsertMyPreferences,
    args
  )
