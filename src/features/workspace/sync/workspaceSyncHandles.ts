// src/features/workspace/sync/workspaceSyncHandles.ts
// handle registry for workspace-owned cloud sync adapters

import {
  setupPreferencesCloudSync,
  type PreferencesCloudSyncHandle,
} from '~/features/platform/preferences/data/cloud/cloudSync'
import {
  setupTierPresetCloudSync,
  type TierPresetCloudSyncHandle,
} from '~/features/workspace/tier-presets/data/cloud/cloudSync'
import type { BoardDeleteCloudSyncHandle } from '~/features/workspace/boards/data/cloud/setupBoardDeleteCloudSync'
import { CLOUD_SYNC_DEBOUNCE_MS } from '~/features/platform/sync/lib/concurrency'

interface WorkspaceSyncInstallOptions
{
  userId: string
  isOnline: () => boolean
  shouldProceed: () => boolean
  onInstalled: () => void
}

interface WorkspaceSyncHandleRegistry
{
  preferencesRef: { current: PreferencesCloudSyncHandle | null }
  presetsRef: { current: TierPresetCloudSyncHandle | null }
  boardDeleteRef: { current: BoardDeleteCloudSyncHandle | null }
  installPreferences: (options: WorkspaceSyncInstallOptions) => void
  installPresets: (options: WorkspaceSyncInstallOptions) => void
  disposeAll: () => void
}

export const createWorkspaceSyncHandleRegistry =
  (): WorkspaceSyncHandleRegistry =>
  {
    const preferencesRef: { current: PreferencesCloudSyncHandle | null } = {
      current: null,
    }
    const presetsRef: { current: TierPresetCloudSyncHandle | null } = {
      current: null,
    }
    const boardDeleteRef: { current: BoardDeleteCloudSyncHandle | null } = {
      current: null,
    }

    const installPreferences = ({
      userId,
      isOnline,
      shouldProceed,
      onInstalled,
    }: WorkspaceSyncInstallOptions): void =>
    {
      if (!shouldProceed() || preferencesRef.current) return

      preferencesRef.current = setupPreferencesCloudSync({
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
        preferencesRef.current,
        presetsRef.current,
        boardDeleteRef.current,
      ].filter(
        (handle): handle is NonNullable<typeof handle> => handle !== null
      )
      preferencesRef.current = null
      presetsRef.current = null
      boardDeleteRef.current = null
      if (handles.length > 0)
      {
        void Promise.allSettled(handles.map((handle) => handle.dispose()))
      }
    }

    return {
      preferencesRef,
      presetsRef,
      boardDeleteRef,
      installPreferences,
      installPresets,
      disposeAll,
    }
  }
