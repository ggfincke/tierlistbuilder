// src/features/platform/sync/orchestration/useHandleRegistry.ts
// settings/presets/board-delete cloud-sync handle refs + install & dispose helpers

import { useState } from 'react'
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

export interface InstallOptions
{
  userId: string
  shouldProceed: () => boolean
  onInstalled: () => void
}

export interface HandleRegistry
{
  settingsRef: { current: SettingsCloudSyncHandle | null }
  presetsRef: { current: TierPresetCloudSyncHandle | null }
  boardDeleteRef: { current: BoardDeleteCloudSyncHandle | null }
  installSettings: (options: InstallOptions) => void
  installPresets: (options: InstallOptions) => void
  disposeAll: () => void
}

// owns the three handle refs & guards install against shouldProceed + already-
// installed. disposeAll clears refs first then fires handle.dispose in
// parallel (handles don't share state). identity is stable across renders
export const useHandleRegistry = (): HandleRegistry =>
{
  const [registry] = useState<HandleRegistry>(() =>
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
      shouldProceed,
      onInstalled,
    }: InstallOptions): void =>
    {
      if (!shouldProceed() || settingsRef.current) return

      settingsRef.current = setupSettingsCloudSync({
        debounceMs: CLOUD_SYNC_DEBOUNCE_MS,
        userId,
        shouldProceed,
      })
      onInstalled()
    }

    const installPresets = ({
      userId,
      shouldProceed,
      onInstalled,
    }: InstallOptions): void =>
    {
      if (!shouldProceed() || presetsRef.current) return

      presetsRef.current = setupTierPresetCloudSync({
        debounceMs: CLOUD_SYNC_DEBOUNCE_MS,
        userId,
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
  })

  return registry
}
