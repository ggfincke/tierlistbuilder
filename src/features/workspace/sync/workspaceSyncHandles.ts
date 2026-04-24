// src/features/workspace/sync/workspaceSyncHandles.ts
// handle registry for workspace-owned cloud sync adapters

import {
  setupSettingsCloudSync,
  type SettingsCloudSyncHandle,
} from '~/features/workspace/settings/data/cloud/cloudSync'
import {
  setupTierPresetCloudSync,
  type TierPresetCloudSyncHandle,
} from '~/features/workspace/tier-presets/data/cloud/cloudSync'
import type { BoardDeleteCloudSyncHandle } from '~/features/workspace/boards/data/cloud/setupBoardDeleteCloudSync'
import { CLOUD_SYNC_DEBOUNCE_MS } from '~/features/platform/sync/lib/concurrency'

export interface WorkspaceSyncInstallOptions
{
  userId: string
  isOnline: () => boolean
  shouldProceed: () => boolean
  onInstalled: () => void
}

export interface WorkspaceSyncHandleRegistry
{
  settingsRef: { current: SettingsCloudSyncHandle | null }
  presetsRef: { current: TierPresetCloudSyncHandle | null }
  boardDeleteRef: { current: BoardDeleteCloudSyncHandle | null }
  installSettings: (options: WorkspaceSyncInstallOptions) => void
  installPresets: (options: WorkspaceSyncInstallOptions) => void
  disposeAll: () => void
}

export const createWorkspaceSyncHandleRegistry =
  (): WorkspaceSyncHandleRegistry =>
  {
    const settingsRef: { current: SettingsCloudSyncHandle | null } = {
      current: null,
    }
    const presetsRef: { current: TierPresetCloudSyncHandle | null } = {
      current: null,
    }
    const boardDeleteRef: { current: BoardDeleteCloudSyncHandle | null } = {
      current: null,
    }

    const installSettings = ({
      userId,
      isOnline,
      shouldProceed,
      onInstalled,
    }: WorkspaceSyncInstallOptions): void =>
    {
      if (!shouldProceed() || settingsRef.current) return

      settingsRef.current = setupSettingsCloudSync({
        debounceMs: CLOUD_SYNC_DEBOUNCE_MS,
        userId,
        isOnline,
        shouldProceed,
      })
      onInstalled()
    }

    const installPresets = ({
      userId,
      isOnline,
      shouldProceed,
      onInstalled,
    }: WorkspaceSyncInstallOptions): void =>
    {
      if (!shouldProceed() || presetsRef.current) return

      presetsRef.current = setupTierPresetCloudSync({
        debounceMs: CLOUD_SYNC_DEBOUNCE_MS,
        userId,
        isOnline,
        shouldProceed,
      })
      onInstalled()
    }

    const disposeAll = (): void =>
    {
      const handles = [
        settingsRef.current,
        presetsRef.current,
        boardDeleteRef.current,
      ].filter(
        (handle): handle is NonNullable<typeof handle> => handle !== null
      )
      settingsRef.current = null
      presetsRef.current = null
      boardDeleteRef.current = null
      if (handles.length > 0)
      {
        void Promise.allSettled(handles.map((handle) => handle.dispose()))
      }
    }

    return {
      settingsRef,
      presetsRef,
      boardDeleteRef,
      installSettings,
      installPresets,
      disposeAll,
    }
  }
