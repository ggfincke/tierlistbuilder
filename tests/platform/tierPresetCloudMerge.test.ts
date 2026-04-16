import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'

const {
  createTierPresetImperativeMock,
  deleteTierPresetImperativeMock,
  listMyTierPresetsImperativeMock,
} = vi.hoisted(() => ({
  createTierPresetImperativeMock: vi.fn(),
  deleteTierPresetImperativeMock: vi.fn(),
  listMyTierPresetsImperativeMock: vi.fn(),
}))

vi.mock(
  '~/features/workspace/tier-presets/data/cloud/tierPresetRepository',
  () => ({
    createTierPresetImperative: createTierPresetImperativeMock,
    deleteTierPresetImperative: deleteTierPresetImperativeMock,
    listMyTierPresetsImperative: listMyTierPresetsImperativeMock,
  })
)

import { mergeTierPresetsOnFirstLogin } from '~/features/platform/sync/tierPresetCloudMerge'
import {
  loadTierPresetSyncMetaMap,
  upsertTierPresetSyncMeta,
} from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'

const createMemoryStorage = (): Storage =>
{
  const values = new Map<string, string>()

  return {
    get length()
    {
      return values.size
    },
    clear: () =>
    {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) =>
    {
      values.delete(key)
    },
    setItem: (key, value) =>
    {
      values.set(key, value)
    },
  } as Storage
}

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

describe('tierPresetCloudMerge', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', createMemoryStorage())
    createTierPresetImperativeMock.mockReset()
    deleteTierPresetImperativeMock.mockReset()
    listMyTierPresetsImperativeMock.mockReset()
    useTierPresetStore.setState({ userPresets: [] })
  })

  afterEach(() =>
  {
    vi.unstubAllGlobals()
  })

  it('preserves same-user delete tombstones across remounts', async () =>
  {
    upsertTierPresetSyncMeta('preset-delete' as UserPresetId, {
      pendingOp: 'delete',
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    listMyTierPresetsImperativeMock.mockResolvedValue([
      buildCloudRow('preset-delete' as UserPresetId),
    ])
    deleteTierPresetImperativeMock.mockResolvedValue(undefined)

    const result = await mergeTierPresetsOnFirstLogin({ userId: 'user-a' })

    expect(result.deletedCount).toBe(1)
    expect(deleteTierPresetImperativeMock).toHaveBeenCalledWith({
      presetExternalId: 'preset-delete',
    })
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

    listMyTierPresetsImperativeMock.mockResolvedValue([
      buildCloudRow('preset-delete' as UserPresetId),
    ])

    const result = await mergeTierPresetsOnFirstLogin({ userId: 'user-b' })

    expect(result.pulledCount).toBe(1)
    expect(deleteTierPresetImperativeMock).not.toHaveBeenCalled()
    expect(useTierPresetStore.getState().userPresets).toHaveLength(1)
    expect(useTierPresetStore.getState().userPresets[0]?.id).toBe(
      'preset-delete'
    )
    expect(
      loadTierPresetSyncMetaMap()['preset-delete' as UserPresetId]
    ).toMatchObject({ ownerUserId: 'user-b', pendingOp: null })
  })
})
