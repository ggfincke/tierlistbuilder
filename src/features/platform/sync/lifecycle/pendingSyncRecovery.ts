// src/features/platform/sync/lifecycle/pendingSyncRecovery.ts
// resumes pending sync for boards, settings, & presets after first-login merge
// or offline -> online transition; safe to call repeatedly (dedupes per key)

import type { BoardId, UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import { selectBoardDataFields } from '~/features/workspace/boards/model/boardSnapshot'
import { loadBoardDeleteSyncMeta } from '~/features/workspace/boards/data/local/boardDeleteSyncMeta'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { extractAppSettings } from '~/features/workspace/settings/model/appSettingsExtraction'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import { loadSettingsSyncMetaForUser } from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { loadTierPresetSyncMetaMapForUser } from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'
import { readBoardStateForCloudSync } from '../boards/cloudFlush'
import type { PendingBoardSync } from '../boards/cloudSyncScheduler'
import type { TierPresetSyncWork } from '../tier-presets/cloudSync'

interface ResumePendingSyncsOptions
{
  userId: string
  // takes a callback rather than the scheduler directly so useCloudSync owns
  // runners & this helper stays ignorant of runner internals
  queueBoard: (work: PendingBoardSync) => void
  // optional — runners mount AFTER first-login merge resolves; if undefined
  // the corresponding pass is silently skipped until the next call
  triggerSettings?: () => void
  enqueuePreset?: (work: TierPresetSyncWork) => void
  // board-delete drain trigger. fire & forget; the drainer reads the
  // sidecar internally & no-ops when empty, so passing it always (even
  // when nothing is pending) is cheap
  triggerBoardDelete?: () => void
  // optional auth/online gate matching the runners' shouldProceed semantics.
  // if it returns false at any boundary, the helper bails before queueing
  shouldProceed?: () => boolean
}

export interface ResumePendingSyncsResult
{
  resumedBoardIds: BoardId[]
  resumedBoardDeleteIds: string[]
  resumedSettings: boolean
  resumedPresetIds: UserPresetId[]
}

const isUserPresetId = (id: string): id is UserPresetId =>
  id.startsWith('preset-')

const resumeBoards = (options: ResumePendingSyncsOptions): BoardId[] =>
{
  const canProceed = (): boolean =>
    options.shouldProceed ? options.shouldProceed() : true
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
      // selectBoardDataFields takes any object w/ the 5 BoardSnapshot data
      // keys — a snapshot satisfies that shape directly
      boardDataSelection: selectBoardDataFields(snapshot),
      syncState,
    })
    resumed.push(meta.id)
  }

  return resumed
}

const resumeSettings = (options: ResumePendingSyncsOptions): boolean =>
{
  const canProceed = (): boolean =>
    options.shouldProceed ? options.shouldProceed() : true
  if (!canProceed()) return false
  if (!options.triggerSettings) return false

  const meta = loadSettingsSyncMetaForUser(options.userId)
  if (meta.pendingSyncAt === null) return false

  options.triggerSettings()
  return true
}

const resumePresets = (options: ResumePendingSyncsOptions): UserPresetId[] =>
{
  const canProceed = (): boolean =>
    options.shouldProceed ? options.shouldProceed() : true
  if (!canProceed()) return []
  if (!options.enqueuePreset) return []

  const map = loadTierPresetSyncMetaMapForUser(options.userId)
  if (Object.keys(map).length === 0) return []

  const localPresets = useTierPresetStore.getState().userPresets
  const localById = new Map(
    localPresets
      .filter((preset) => isUserPresetId(preset.id))
      .map((preset) => [preset.id as UserPresetId, preset])
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
      // an 'upsert' sidecar entry without a matching store entry is a
      // contradiction — the preset was deleted between the stamp & the
      // resume. drop it & let normal flow eventually clear the sidecar
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
      // a 'delete' sidecar entry w/ a matching store entry is also a
      // contradiction — the preset reappeared. skip the delete since the
      // upsert path will eventually take over once the user touches it
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
  const canProceed = (): boolean =>
    options.shouldProceed ? options.shouldProceed() : true
  if (!canProceed()) return []
  if (!options.triggerBoardDelete) return []

  // read sidecar before firing so the return value mirrors board/preset arrays;
  // the drainer re-reads internally, so this is cheap observability only
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

// re-export for callers that only need to evaluate fresh-from-store settings
// (the trigger fn captures useSettingsStore at call time, not at install time)
export const buildSettingsTriggerSnapshot = () =>
  extractAppSettings(useSettingsStore.getState())
