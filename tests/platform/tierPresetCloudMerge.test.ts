// tests/platform/tierPresetCloudMerge.test.ts
// tier preset cloud merge strategy

import { beforeEach, describe, expect, it } from 'vitest'
import type { UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import {
  mergeTierPresetsOnFirstLogin,
  type TierPresetMergeDeps,
} from '~/features/workspace/tier-presets/data/cloud/cloudMerge'
import {
  loadTierPresetSyncMetaMap,
  upsertTierPresetSyncMeta,
} from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'

const buildCloudRow = (presetId: UserPresetId): TierPresetCloudRow => ({
  externalId: presetId,
  name: 'Cloud preset',
  tiers: [
    {
      name: 'S',
      colorSpec: createPaletteTierColorSpec(0),
    },
  ],
  createdAt: 1,
  updatedAt: 2,
})

interface FakeDepsConfig
{
  cloudRows?: TierPresetCloudRow[]
}

interface FakeDeps
{
  deps: TierPresetMergeDeps
  createCalls: { externalId: string; name: string }[]
  deleteCalls: { presetExternalId: string }[]
}

// in-memory deps that record calls — the production wiring uses convex
// adapters, but the merge logic only cares about the surface contract
const createFakeDeps = (config: FakeDepsConfig = {}): FakeDeps =>
{
  const createCalls: { externalId: string; name: string }[] = []
  const deleteCalls: { presetExternalId: string }[] = []
  return {
    createCalls,
    deleteCalls,
    deps: {
      listMyTierPresets: async () => config.cloudRows ?? [],
      createTierPreset: async (args) =>
      {
        createCalls.push({ externalId: args.externalId, name: args.name })
        return { updatedAt: 1 }
      },
      deleteTierPreset: async (args) =>
      {
        deleteCalls.push(args)
        return null
      },
    },
  }
}

describe('tierPresetCloudMerge', () =>
{
  beforeEach(() =>
  {
    useTierPresetStore.setState({ userPresets: [] })
  })

  it('preserves same-user delete tombstones across remounts', async () =>
  {
    upsertTierPresetSyncMeta('preset-delete' as UserPresetId, {
      pendingOp: 'delete',
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    const { deps, deleteCalls } = createFakeDeps({
      cloudRows: [buildCloudRow('preset-delete' as UserPresetId)],
    })

    const result = await mergeTierPresetsOnFirstLogin({
      userId: 'user-a',
      deps,
    })

    expect(result.deletedCount).toBe(1)
    expect(deleteCalls).toEqual([{ presetExternalId: 'preset-delete' }])
    expect(useTierPresetStore.getState().userPresets).toEqual([])
    expect(loadTierPresetSyncMetaMap()).toEqual({})
  })

  it('ignores a different user’s tombstone & pulls the cloud preset', async () =>
  {
    upsertTierPresetSyncMeta('preset-delete' as UserPresetId, {
      pendingOp: 'delete',
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    const { deps, deleteCalls } = createFakeDeps({
      cloudRows: [buildCloudRow('preset-delete' as UserPresetId)],
    })

    const result = await mergeTierPresetsOnFirstLogin({
      userId: 'user-b',
      deps,
    })

    expect(result.pulledCount).toBe(1)
    expect(deleteCalls).toEqual([])
    expect(useTierPresetStore.getState().userPresets).toHaveLength(1)
    expect(useTierPresetStore.getState().userPresets[0]?.id).toBe(
      'preset-delete'
    )
    expect(
      loadTierPresetSyncMetaMap()['preset-delete' as UserPresetId]
    ).toMatchObject({ ownerUserId: 'user-b', pendingOp: null })
  })
})
