// tests/convex/tierPresetMutations.test.ts
// Convex tier-preset mutation validation boundaries

import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_CLOUD_BOARD_TIERS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  asUser,
  expectConvexCode,
  makeTest,
  seedUser,
} from '@tests/convex/convexTestHelpers'

const makeTier = (patch: Partial<TierPresetTier> = {}): TierPresetTier => ({
  name: 'S',
  colorSpec: { kind: 'palette', index: 0 },
  ...patch,
})

describe('tier preset mutations', () =>
{
  it.each([
    [
      'too many tiers',
      Array.from({ length: MAX_CLOUD_BOARD_TIERS + 1 }, (_, index) =>
        makeTier({ name: `Tier ${index}` })
      ),
    ],
    [
      'invalid custom tier color',
      [makeTier({ colorSpec: { kind: 'custom', hex: 'blue' } })],
    ],
  ])('rejects %s', async (_, tiers) =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const caller = asUser(t, userId)

    await expectConvexCode(
      caller.mutation(api.workspace.tierPresets.mutations.createTierPreset, {
        externalId: 'preset-invalid',
        name: 'Invalid Preset',
        tiers,
      }),
      CONVEX_ERROR_CODES.invalidInput
    )
  })

  it('persists and returns a valid preset', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const caller = asUser(t, userId)
    const tiers = [
      makeTier({
        name: 'S',
        colorSpec: { kind: 'custom', hex: '#ffcc00' },
        rowColorSpec: { kind: 'custom', hex: '#fff7cc' },
        description: 'Best of the best',
      }),
      makeTier({ name: 'A', colorSpec: { kind: 'palette', index: 1 } }),
    ]

    const result = await caller.mutation(
      api.workspace.tierPresets.mutations.createTierPreset,
      {
        externalId: 'preset-valid',
        name: 'Valid Preset',
        tiers,
      }
    )

    expect(result.updatedAt).toEqual(expect.any(Number))
    const rows = await caller.query(
      api.workspace.tierPresets.queries.getMyTierPresets,
      {}
    )
    expect(rows).toEqual([
      expect.objectContaining({
        externalId: 'preset-valid',
        name: 'Valid Preset',
        tiers,
        updatedAt: result.updatedAt,
      }),
    ])
  })
})
