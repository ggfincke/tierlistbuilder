// src/features/platform/sync/tier-presets/cloudSync.ts
// per-preset cloud-sync runner + subscriber — per-key controllers, debounce &
// exponential backoff; diffs useTierPresetStore to enqueue upsert/delete ops

import type { UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import {
  diffUserPresets,
  tierPresetEqual,
  userPresetsEqual,
} from '~/features/workspace/tier-presets/model/tierPresetDiff'
import {
  createTierPresetImperative,
  deleteTierPresetImperative,
} from '~/features/workspace/tier-presets/data/cloud/tierPresetRepository'
import {
  clearTierPresetPending,
  markTierPresetSynced,
  removeTierPresetSyncMeta,
  stampTierPresetPending,
} from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'
import {
  createDebouncedSyncRunner,
  type TriggerOptions,
} from '~/shared/lib/sync/debouncedSyncRunner'
import {
  isOfflineError,
  makeOfflineError,
} from '~/features/platform/sync/lib/errors'
import { useSyncStatusStore } from '../status/syncStatusStore'

// flush input — discriminated on op so 'delete' doesn't drag along an
// unused snapshot field. for upserts the snapshot is the latest known
// state of the preset (subscriber resolves it from useTierPresetStore)
export type TierPresetSyncWork =
  | { presetId: UserPresetId; op: 'upsert'; preset: TierPreset }
  | { presetId: UserPresetId; op: 'delete' }

interface CreateTierPresetSyncRunnerOptions
{
  userId: string
  debounceMs: number
  shouldProceed?: () => boolean
}

export interface TierPresetSyncRunner
{
  enqueue: (work: TierPresetSyncWork, options?: TriggerOptions) => void
  dispose: () => Promise<void>
}

// bytes-dedup — skip the round trip if the queued op matches the last
// successful upload. deletes are idempotent but the sidecar purge happens
// inside onSuccess so a redundant delete is a wasted RPC; bail early
const tierPresetWorkEqual = (
  a: TierPresetSyncWork,
  b: TierPresetSyncWork
): boolean =>
{
  if (a.op !== b.op) return false
  if (a.op === 'delete') return true
  return tierPresetEqual(a.preset, (b as typeof a).preset)
}

export const createTierPresetSyncRunner = (
  options: CreateTierPresetSyncRunnerOptions
): TierPresetSyncRunner =>
{
  const runner = createDebouncedSyncRunner<
    UserPresetId,
    TierPresetSyncWork,
    { syncedAt: number }
  >({
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
    dedupEqual: tierPresetWorkEqual,
    onQueue: (work) =>
      stampTierPresetPending(work.presetId, work.op, options.userId),
    onSuccess: ({ syncedAt }, work) =>
    {
      if (work.op === 'delete')
      {
        removeTierPresetSyncMeta(work.presetId)
        return
      }
      markTierPresetSynced(work.presetId, options.userId, syncedAt)
    },
    onDedup: (work) =>
    {
      // delete-dedup: sidecar was already purged by the prior onSuccess,
      // so clearing the pending marker is a no-op. upsert-dedup: clear
      // pendingOp & pendingSyncAt but leave lastSyncedAt alone
      if (work.op === 'delete')
      {
        removeTierPresetSyncMeta(work.presetId)
        return
      }
      clearTierPresetPending(work.presetId, options.userId)
    },
    onError: (error, presetId) =>
    {
      if (isOfflineError(error)) return
      console.warn(`Tier preset sync failed for ${presetId}:`, error)
    },
    flush: async (work) =>
    {
      // mirror the board scheduler's offline gating so failed flushes back
      // off cleanly w/o issuing a doomed network call. resumePendingSyncs
      // walks the sidecar on online -> drains everything in one pass
      if (!useSyncStatusStore.getState().online)
      {
        return { kind: 'error', error: makeOfflineError() }
      }

      try
      {
        if (work.op === 'delete')
        {
          await deleteTierPresetImperative({ presetExternalId: work.presetId })
          return { kind: 'synced', success: { syncedAt: Date.now() } }
        }

        const result = await createTierPresetImperative({
          externalId: work.preset.id,
          name: work.preset.name,
          tiers: work.preset.tiers,
        })
        return { kind: 'synced', success: { syncedAt: result.updatedAt } }
      }
      catch (error)
      {
        return { kind: 'error', error }
      }
    },
  })

  return {
    enqueue: (work, triggerOptions) =>
      runner.enqueue(work.presetId, work, triggerOptions),
    dispose: runner.dispose,
  }
}

interface SetupTierPresetCloudSyncOptions
{
  debounceMs: number
  userId: string
  shouldProceed?: () => boolean
}

export interface TierPresetCloudSyncHandle
{
  runner: TierPresetSyncRunner
  dispose: () => Promise<void>
}

export const setupTierPresetCloudSync = (
  options: SetupTierPresetCloudSyncOptions
): TierPresetCloudSyncHandle =>
{
  const runner = createTierPresetSyncRunner({
    userId: options.userId,
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
  })

  // capture initial snapshot so the first diff doesn't treat existing presets
  // as fresh inserts — they're synced or will be picked up by the merge
  let prevPresets: TierPreset[] = useTierPresetStore.getState().userPresets

  const unsubscribe = useTierPresetStore.subscribe(
    (state) => state.userPresets,
    (next) =>
    {
      if (options.shouldProceed && !options.shouldProceed()) return
      const ops = diffUserPresets(prevPresets, next)
      prevPresets = next

      for (const op of ops)
      {
        if (op.kind === 'upsert')
        {
          runner.enqueue({
            presetId: op.presetId,
            op: 'upsert',
            preset: op.preset,
          })
        }
        else
        {
          runner.enqueue({ presetId: op.presetId, op: 'delete' })
        }
      }
    },
    { equalityFn: userPresetsEqual }
  )

  return {
    runner,
    dispose: async () =>
    {
      unsubscribe()
      await runner.dispose()
    },
  }
}
