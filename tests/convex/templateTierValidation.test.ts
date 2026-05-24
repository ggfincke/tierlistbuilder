// tests/convex/templateTierValidation.test.ts
// Convex marketplace template tier validation boundaries

import { describe, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_CLOUD_BOARD_TIERS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  asUser,
  expectConvexCode,
  makeRateLimitedTest as makeTest,
  seedCloudBoard,
  seedUser,
} from './convexTestHelpers'

describe('template tier validation', () =>
{
  it('rejects publishing a board whose suggested tiers exceed the template cap', async () =>
  {
    const t = makeTest()
    const authorId = await seedUser(t, 'Template Author', 'author@example.com')

    await t.run(async (ctx) =>
    {
      const boardId = await seedCloudBoard(ctx, {
        externalId: 'board-too-many-template-tiers',
        ownerId: authorId,
        title: 'Too Many Template Tiers',
        activeItemCount: 1,
      })
      const tierIds: Id<'boardTiers'>[] = []

      for (let i = 0; i < MAX_CLOUD_BOARD_TIERS + 1; i++)
      {
        tierIds.push(
          await ctx.db.insert('boardTiers', {
            boardId,
            externalId: `tier-template-cap-${i}`,
            name: `Tier ${i}`,
            colorSpec: { kind: 'palette', index: i % 8 },
            order: i,
          })
        )
      }

      await ctx.db.insert('boardItems', {
        boardId,
        tierId: tierIds[0] ?? null,
        externalId: 'item-template-cap',
        label: 'Template cap item',
        mediaAssetId: null,
        order: 0,
        deletedAt: null,
      })
    })

    await expectConvexCode(
      asUser(t, authorId).mutation(
        api.marketplace.templates.mutations.publishFromBoard,
        {
          boardExternalId: 'board-too-many-template-tiers',
          title: 'Too Many Template Tiers',
          category: 'gaming',
          tags: [],
          visibility: 'public',
        }
      ),
      CONVEX_ERROR_CODES.invalidInput
    )
  })
})
