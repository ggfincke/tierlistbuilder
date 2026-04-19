// src/features/platform/sync/settings/cloudMerge.ts
// first-login settings merge — silent. pending local edit -> push local;
// cloud row & no pending edit -> pull cloud; otherwise -> push local defaults

import type {
  AppSettings,
  CloudSettingsRead,
} from '@tierlistbuilder/contracts/workspace/settings'
import {
  getMySettingsImperative,
  upsertMySettingsImperative,
} from '~/features/workspace/settings/data/cloud/settingsRepository'
import {
  loadSettingsSyncMetaForUser,
  markSettingsSynced,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { extractAppSettings } from '~/features/workspace/settings/model/appSettingsExtraction'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'

export type SettingsMergeResult =
  | { kind: 'push'; updatedAt: number }
  | { kind: 'pull'; updatedAt: number }
  | { kind: 'noop' }
  | { kind: 'aborted' }
  | { kind: 'error'; error: unknown }

// repository surface injected by callers — production wires the convex
// imperative adapters; tests pass in-memory fakes so the merge logic can
// run w/o vi.mock around the cloud module
export interface SettingsMergeDeps
{
  getMySettings: () => Promise<CloudSettingsRead | null>
  upsertMySettings: (args: {
    settings: AppSettings
  }) => Promise<{ updatedAt: number }>
}

const DEFAULT_SETTINGS_MERGE_DEPS: SettingsMergeDeps = {
  getMySettings: getMySettingsImperative,
  upsertMySettings: upsertMySettingsImperative,
}

interface MergeSettingsOptions
{
  userId: string
  shouldProceed?: () => boolean
  deps?: SettingsMergeDeps
}

// load AppSettings into the store w/o tripping the subscriber — caller arms
// the subscriber AFTER merge resolves so this store-load is invisible
const applyAppSettingsToStore = (settings: AppSettings): void =>
{
  // useSettingsStore's setState merges into the existing state, preserving
  // the setter functions. we pass the AppSettings fields directly
  useSettingsStore.setState(settings)
}

export const mergeSettingsOnFirstLogin = async ({
  userId,
  shouldProceed,
  deps = DEFAULT_SETTINGS_MERGE_DEPS,
}: MergeSettingsOptions): Promise<SettingsMergeResult> =>
{
  const canProceed = makeProceedGuard(shouldProceed)

  if (!canProceed())
  {
    return { kind: 'aborted' }
  }

  let cloudRead: CloudSettingsRead | null
  try
  {
    cloudRead = await deps.getMySettings()
  }
  catch (error)
  {
    return { kind: 'error', error }
  }

  if (!canProceed())
  {
    return { kind: 'aborted' }
  }

  const sidecar = loadSettingsSyncMetaForUser(userId)
  const hasPendingLocal = sidecar.pendingSyncAt !== null

  // pull path: cloud non-null & local has no pending edit. apply cloud &
  // stamp the sidecar w/ the cloud row's actual updatedAt so future merges
  // can compare timestamps correctly
  if (cloudRead !== null && !hasPendingLocal)
  {
    applyAppSettingsToStore(cloudRead.settings)
    markSettingsSynced(userId, cloudRead.updatedAt)
    return { kind: 'pull', updatedAt: cloudRead.updatedAt }
  }

  // push path: either cloud is empty, or local has pending edits we don't
  // want to lose. send the local state up
  const localSettings = extractAppSettings(useSettingsStore.getState())
  try
  {
    const result = await deps.upsertMySettings({ settings: localSettings })
    if (!canProceed())
    {
      return { kind: 'aborted' }
    }
    markSettingsSynced(userId, result.updatedAt)
    return { kind: 'push', updatedAt: result.updatedAt }
  }
  catch (error)
  {
    return { kind: 'error', error }
  }
}
