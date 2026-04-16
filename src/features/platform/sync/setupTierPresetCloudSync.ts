// src/features/platform/sync/setupTierPresetCloudSync.ts
// installs the tier-preset cloud-sync subscriber. wires useTierPresetStore
// changes through diffUserPresets to derive per-preset upsert/delete ops,
// then enqueues each op into the TierPresetSyncRunner. returns a disposer
// for the subscription & runner

import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import { diffUserPresets } from '~/features/workspace/tier-presets/model/tierPresetDiff'
import {
  createTierPresetImperative,
  deleteTierPresetImperative,
} from '~/features/workspace/tier-presets/data/cloud/tierPresetRepository'
import { useSyncStatusStore } from './syncStatusStore'
import {
  createTierPresetSyncRunner,
  type TierPresetFlushResult,
  type TierPresetSyncRunner,
  type TierPresetSyncWork,
} from './tierPresetCloudSync'

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

const flushOne = async (
  work: TierPresetSyncWork,
  shouldProceed?: () => boolean
): Promise<TierPresetFlushResult> =>
{
  if (shouldProceed && !shouldProceed())
  {
    return { kind: 'error', error: new Error('auth changed mid-flush') }
  }

  // mirror the board scheduler's offline gating so failed flushes back
  // off cleanly w/o issuing a doomed network call. resumePendingSyncs
  // walks the sidecar on online -> drains everything in one pass
  if (!useSyncStatusStore.getState().online)
  {
    return { kind: 'error', error: new Error('offline') }
  }

  try
  {
    if (work.op === 'delete')
    {
      await deleteTierPresetImperative({ presetExternalId: work.presetId })
      return { kind: 'synced', syncedAt: Date.now() }
    }

    const result = await createTierPresetImperative({
      externalId: work.preset.id,
      name: work.preset.name,
      tiers: work.preset.tiers,
    })
    return { kind: 'synced', syncedAt: result.updatedAt }
  }
  catch (error)
  {
    return { kind: 'error', error }
  }
}

export const setupTierPresetCloudSync = (
  options: SetupTierPresetCloudSyncOptions
): TierPresetCloudSyncHandle =>
{
  const runner = createTierPresetSyncRunner({
    userId: options.userId,
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
    flush: (work) => flushOne(work, options.shouldProceed),
    onError: (presetId, error) =>
    {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'offline') return
      console.warn(`Tier preset sync failed for ${presetId}:`, error)
    },
  })

  // capture initial snapshot at install time so the first diff doesn't
  // treat existing presets as fresh inserts. they're either already
  // synced (sidecar.lastSyncedAt set) or will be picked up by the
  // first-login merge — either way, the subscriber's job is to react
  // to runtime changes, not seed the cloud
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
    }
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
