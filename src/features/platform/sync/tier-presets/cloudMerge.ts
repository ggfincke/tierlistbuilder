// src/features/platform/sync/tier-presets/cloudMerge.ts
// first-login merge for user-saved tier presets — silent union by externalId;
// pendingOp drives direction (push/delete/pull); unflushed intent wins

import {
  asUserPresetId,
  isUserPresetId,
  type UserPresetId,
} from '@tierlistbuilder/contracts/lib/ids'
import type {
  TierPreset,
  TierPresetTier,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import {
  createTierPresetImperative,
  deleteTierPresetImperative,
  listMyTierPresetsImperative,
} from '~/features/workspace/tier-presets/data/cloud/tierPresetRepository'
import {
  loadTierPresetSyncMetaMapForUser,
  markTierPresetSynced,
  removeTierPresetSyncMeta,
} from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import { mapAsyncLimitSettled } from '~/shared/lib/asyncMapLimit'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'

const PRESET_MERGE_CONCURRENCY = 3

export interface PresetMergeResult
{
  kind: 'success' | 'aborted'
  pushedCount: number
  pulledCount: number
  deletedCount: number
  failedCount: number
}

// repository surface injected by callers — production wires the convex
// imperative adapters; tests pass in-memory fakes so the merge logic can
// run w/o vi.mock around the cloud module
export interface TierPresetMergeDeps
{
  listMyTierPresets: () => Promise<TierPresetCloudRow[]>
  createTierPreset: (args: {
    externalId: string
    name: string
    tiers: TierPresetTier[]
  }) => Promise<{ updatedAt: number }>
  deleteTierPreset: (args: { presetExternalId: string }) => Promise<null>
}

const DEFAULT_TIER_PRESET_MERGE_DEPS: TierPresetMergeDeps = {
  listMyTierPresets: listMyTierPresetsImperative,
  createTierPreset: createTierPresetImperative,
  deleteTierPreset: deleteTierPresetImperative,
}

interface MergePresetsOptions
{
  userId: string
  shouldProceed?: () => boolean
  deps?: TierPresetMergeDeps
}

// hydrate a cloud row into a TierPreset; all cloud-stored presets are user
// presets (built-ins are client-side only) & externalId == PresetId
const cloudRowToTierPreset = (row: TierPresetCloudRow): TierPreset | null =>
{
  if (!isUserPresetId(row.externalId))
  {
    return null
  }
  return {
    id: row.externalId,
    name: row.name,
    builtIn: false,
    tiers: row.tiers,
  }
}

const buildCloudIndex = (
  rows: TierPresetCloudRow[]
): Map<UserPresetId, TierPresetCloudRow> =>
{
  const map = new Map<UserPresetId, TierPresetCloudRow>()
  for (const row of rows)
  {
    if (!isUserPresetId(row.externalId))
    {
      continue
    }
    map.set(row.externalId, row)
  }
  return map
}

interface PushTask
{
  kind: 'push'
  preset: TierPreset
}

interface DeleteTask
{
  kind: 'delete'
  presetId: UserPresetId
}

interface PullTask
{
  kind: 'pull'
  preset: TierPreset
}

type MergeTask = PushTask | DeleteTask | PullTask

const planMergeTasks = (
  cloudRows: TierPresetCloudRow[],
  userId: string
): MergeTask[] =>
{
  const cloudIndex = buildCloudIndex(cloudRows)
  const localPresets = useTierPresetStore.getState().userPresets
  const sidecar = loadTierPresetSyncMetaMapForUser(userId)
  const tasks: MergeTask[] = []
  const visitedIds = new Set<UserPresetId>()

  for (const preset of localPresets)
  {
    // built-in presets are never stored in useTierPresetStore.userPresets,
    // but the type allows BuiltinPresetId — guard defensively
    if (!isUserPresetId(preset.id))
    {
      continue
    }
    visitedIds.add(preset.id)

    const meta = sidecar[preset.id]
    const pendingOp = meta?.pendingOp ?? null

    // explicit push intent from the runtime subscriber
    if (pendingOp === 'upsert')
    {
      tasks.push({ kind: 'push', preset })
      continue
    }

    // never had sync meta — first sign-in for an anon-created preset.
    // push it up so cross-device sync picks it up
    if (!meta)
    {
      tasks.push({ kind: 'push', preset })
      continue
    }

    // synced before & no pending op — cloud is authoritative. if the cloud
    // row is missing treat it as deleted by another device; preserve local copy
  }

  // sidecar entries w/ delete pending whose preset is no longer in the
  // local store — push the delete to the cloud
  for (const [presetId, meta] of Object.entries(sidecar) as Array<
    [UserPresetId, (typeof sidecar)[UserPresetId]]
  >)
  {
    if (visitedIds.has(presetId))
    {
      continue
    }
    if (meta.pendingOp === 'delete')
    {
      tasks.push({ kind: 'delete', presetId })
    }
  }

  // cloud presets not in the local store at all — pull
  for (const [presetId, row] of cloudIndex)
  {
    if (visitedIds.has(presetId))
    {
      continue
    }
    // skip if locally deleted — delete task will catch up the cloud side;
    // re-pulling would resurrect the row before the delete task runs
    const meta = sidecar[presetId]
    if (meta?.pendingOp === 'delete')
    {
      continue
    }
    const preset = cloudRowToTierPreset(row)
    if (!preset)
    {
      continue
    }
    tasks.push({ kind: 'pull', preset })
  }

  return tasks
}

const executeTask = async (
  task: MergeTask,
  userId: string,
  canProceed: () => boolean,
  deps: TierPresetMergeDeps
): Promise<{ ok: boolean }> =>
{
  if (!canProceed())
  {
    return { ok: false }
  }

  switch (task.kind)
  {
    case 'push':
    {
      const result = await deps.createTierPreset({
        externalId: task.preset.id,
        name: task.preset.name,
        tiers: task.preset.tiers,
      })
      markTierPresetSynced(
        asUserPresetId(task.preset.id),
        userId,
        result.updatedAt
      )
      return { ok: true }
    }
    case 'delete':
    {
      await deps.deleteTierPreset({ presetExternalId: task.presetId })
      removeTierPresetSyncMeta(task.presetId)
      return { ok: true }
    }
    case 'pull':
    {
      // adding to the store happens in a single batch after all pulls
      // resolve so we don't churn subscribers on a per-row basis. record
      // success here & let the caller commit to the store
      return { ok: true }
    }
  }
}

export const mergeTierPresetsOnFirstLogin = async ({
  userId,
  shouldProceed,
  deps = DEFAULT_TIER_PRESET_MERGE_DEPS,
}: MergePresetsOptions): Promise<PresetMergeResult> =>
{
  const canProceed = makeProceedGuard(shouldProceed)

  if (!canProceed())
  {
    return {
      kind: 'aborted',
      pushedCount: 0,
      pulledCount: 0,
      deletedCount: 0,
      failedCount: 0,
    }
  }

  let cloudRows: TierPresetCloudRow[]
  try
  {
    cloudRows = await deps.listMyTierPresets()
  }
  catch
  {
    return {
      kind: 'success',
      pushedCount: 0,
      pulledCount: 0,
      deletedCount: 0,
      failedCount: 1,
    }
  }

  if (!canProceed())
  {
    return {
      kind: 'aborted',
      pushedCount: 0,
      pulledCount: 0,
      deletedCount: 0,
      failedCount: 0,
    }
  }

  const tasks = planMergeTasks(cloudRows, userId)

  if (tasks.length === 0)
  {
    return {
      kind: 'success',
      pushedCount: 0,
      pulledCount: 0,
      deletedCount: 0,
      failedCount: 0,
    }
  }

  const settled = await mapAsyncLimitSettled(
    tasks,
    PRESET_MERGE_CONCURRENCY,
    (task) => executeTask(task, userId, canProceed, deps)
  )

  if (!canProceed())
  {
    return {
      kind: 'aborted',
      pushedCount: 0,
      pulledCount: 0,
      deletedCount: 0,
      failedCount: 0,
    }
  }

  // commit successful pulls in one batch — adds them to the local store
  // & lets the subscriber fire just once for the whole pull set
  const presetsToPull: TierPreset[] = []
  let pushedCount = 0
  let pulledCount = 0
  let deletedCount = 0
  let failedCount = 0

  for (let i = 0; i < tasks.length; i++)
  {
    const task = tasks[i]
    const outcome = settled[i]

    if (outcome.status === 'rejected' || !outcome.value.ok)
    {
      failedCount++
      continue
    }

    switch (task.kind)
    {
      case 'push':
        pushedCount++
        break
      case 'delete':
        deletedCount++
        break
      case 'pull':
        presetsToPull.push(task.preset)
        pulledCount++
        break
    }
  }

  if (presetsToPull.length > 0)
  {
    const store = useTierPresetStore.getState()
    const existingIds = new Set(store.userPresets.map((p) => p.id))
    // dedupe in case a presetId snuck into the local store between the
    // plan & the commit (e.g. a concurrent addPreset call)
    const uniquePulls = presetsToPull.filter((p) => !existingIds.has(p.id))

    useTierPresetStore.setState({
      userPresets: [...store.userPresets, ...uniquePulls],
    })

    // mark each pulled preset as synced so future flushes know we have a
    // cloud row already — prevents the runtime subscriber from re-pushing
    // the just-pulled rows on its first diff
    const now = Date.now()
    for (const pulled of uniquePulls)
    {
      if (isUserPresetId(pulled.id))
      {
        markTierPresetSynced(pulled.id, userId, now)
      }
    }
  }

  return {
    kind: 'success',
    pushedCount,
    pulledCount,
    deletedCount,
    failedCount,
  }
}
