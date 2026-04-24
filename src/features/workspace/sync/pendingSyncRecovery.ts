// src/features/workspace/sync/pendingSyncRecovery.ts
// resumes pending workspace sync sidecars after reconnect or sign-in

import {
  asUserPresetId,
  isUserPresetId,
  type BoardId,
  type UserPresetId,
} from '@tierlistbuilder/contracts/lib/ids'
import { selectBoardDataFields } from '~/features/workspace/boards/model/boardSnapshot'
import { loadBoardDeleteSyncMeta } from '~/features/workspace/boards/data/local/boardDeleteSyncMeta'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { extractAppSettings } from '~/features/workspace/settings/model/appSettingsExtraction'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import { loadSettingsSyncMetaForUser } from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { loadTierPresetSyncMetaMapForUser } from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'
import { readBoardStateForCloudSync } from '~/features/workspace/boards/data/cloud/cloudFlush'
import type { PendingBoardSync } from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'
import type { TierPresetSyncWork } from '~/features/workspace/tier-presets/data/cloud/cloudSync'

interface ResumePendingSyncsOptions
{
  userId: string
  queueBoard: (work: PendingBoardSync) => void
  triggerSettings?: () => void
  enqueuePreset?: (work: TierPresetSyncWork) => void
  triggerBoardDelete?: () => void
  shouldProceed?: () => boolean
}

export interface ResumePendingSyncsResult
{
  resumedBoardIds: BoardId[]
  resumedBoardDeleteIds: string[]
  resumedSettings: boolean
  resumedPresetIds: UserPresetId[]
}

const resumeBoards = (options: ResumePendingSyncsOptions): BoardId[] =>
{
  const canProceed = makeProceedGuard(options.shouldProceed)
  if (!canProceed()) return []

  const boards = useWorkspaceBoardRegistryStore.getState().boards
  const resumed: BoardId[] = []

  for (const meta of boards)
  {
    if (!canProceed()) break

    const { snapshot, syncState } = readBoardStateForCloudSync(meta.id)
    if (syncState.pendingSyncAt === null) continue

    options.queueBoard({
      boardId: meta.id,
      snapshot,
      boardDataSelection: selectBoardDataFields(snapshot),
      syncState,
    })
    resumed.push(meta.id)
  }

  return resumed
}

const resumeSettings = (options: ResumePendingSyncsOptions): boolean =>
{
  const canProceed = makeProceedGuard(options.shouldProceed)
  if (!canProceed()) return false
  if (!options.triggerSettings) return false

  const meta = loadSettingsSyncMetaForUser(options.userId)
  if (meta.pendingSyncAt === null) return false

  options.triggerSettings()
  return true
}

const resumePresets = (options: ResumePendingSyncsOptions): UserPresetId[] =>
{
  const canProceed = makeProceedGuard(options.shouldProceed)
  if (!canProceed()) return []
  if (!options.enqueuePreset) return []

  const map = loadTierPresetSyncMetaMapForUser(options.userId)
  if (Object.keys(map).length === 0) return []

  const localPresets = useTierPresetStore.getState().userPresets
  const localById = new Map(
    localPresets
      .filter((preset) => isUserPresetId(preset.id))
      .map((preset) => [asUserPresetId(preset.id), preset])
  )

  const resumed: UserPresetId[] = []

  for (const [presetId, entry] of Object.entries(map) as Array<
    [UserPresetId, (typeof map)[UserPresetId]]
  >)
  {
    if (!canProceed()) break
    if (entry.pendingOp === null) continue

    const localPreset = localById.get(presetId)

    if (entry.pendingOp === 'upsert')
    {
      if (!localPreset) continue
      options.enqueuePreset({
        presetId,
        op: 'upsert',
        preset: localPreset,
      })
      resumed.push(presetId)
      continue
    }

    if (entry.pendingOp === 'delete')
    {
      if (localPreset) continue
      options.enqueuePreset({
        presetId,
        op: 'delete',
      })
      resumed.push(presetId)
    }
  }

  return resumed
}

const resumeBoardDeletes = (options: ResumePendingSyncsOptions): string[] =>
{
  const canProceed = makeProceedGuard(options.shouldProceed)
  if (!canProceed()) return []
  if (!options.triggerBoardDelete) return []

  const meta = loadBoardDeleteSyncMeta()
  if (meta.pendingExternalIds.length === 0) return []

  options.triggerBoardDelete()
  return meta.pendingExternalIds
}

export const resumePendingSyncs = (
  options: ResumePendingSyncsOptions
): ResumePendingSyncsResult =>
{
  return {
    resumedBoardIds: resumeBoards(options),
    resumedBoardDeleteIds: resumeBoardDeletes(options),
    resumedSettings: resumeSettings(options),
    resumedPresetIds: resumePresets(options),
  }
}

export const buildSettingsTriggerSnapshot = () =>
  extractAppSettings(useSettingsStore.getState())
