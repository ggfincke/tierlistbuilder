// tests/convex/rankingCompatibility.test.ts
// compatibility coverage for pre-split public ranking Convex refs

import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import schema from '../../convex/schema'
import { modules } from './convexTestHelpers'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
  convexTest({ schema, modules, transactionLimits: true })

const expectConvexCode = async (
  promise: Promise<unknown>,
  code: string
): Promise<void> =>
{
  await expect(promise).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof ConvexError &&
      typeof error.data === 'object' &&
      error.data !== null &&
      'code' in error.data &&
      error.data.code === code
  )
}

describe('ranking public compatibility wrappers', () =>
{
  it('keeps old public query refs routable', async () =>
  {
    const t = makeTest()

    await expect(
      t.query(api.marketplace.rankings.queries.getRankingBySlug, {
        slug: 'missing-ranking',
      })
    ).resolves.toBeNull()
    await expect(
      t.query(api.marketplace.rankings.queries.getRankingsForTemplate, {
        templateSlug: 'missing-template',
      })
    ).resolves.toEqual({ items: [] })
    await expect(
      t.query(api.marketplace.rankings.queries.listRankingsForTemplate, {
        templateSlug: 'missing-template',
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).resolves.toEqual({
      page: [],
      isDone: true,
      continueCursor: '',
    })
    await expect(
      t.query(api.marketplace.rankings.queries.getTemplateRankingAggregate, {
        templateSlug: 'missing-template',
      })
    ).resolves.toBeNull()
    await expect(
      t.query(
        api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
        {
          templateSlug: 'missing-template',
          generation: 0,
          paginationOpts: { numItems: 10, cursor: null },
        }
      )
    ).resolves.toEqual({
      page: [],
      isDone: true,
      continueCursor: '',
    })
    await expect(
      t.query(api.marketplace.rankings.queries.getMyRankingForTemplate, {
        templateSlug: 'missing-template',
      })
    ).resolves.toEqual({ ranking: null, placements: {} })
    await expect(
      t.query(api.marketplace.rankings.queries.getMyRankings, {})
    ).resolves.toEqual({ items: [] })

    const availability = await t.query(
      api.marketplace.rankings.queries.getBoardRankingPublishAvailability,
      { boardExternalId: 'missing-board' }
    )
    expect(availability).toMatchObject({
      canPublish: false,
      reason: 'sign_in_required',
    })
  })

  it('keeps old public mutation refs routable', async () =>
  {
    const t = makeTest()

    await expect(
      t.mutation(api.marketplace.rankings.mutations.recordRankingView, {
        slug: 'missing-ranking',
      })
    ).resolves.toBeNull()
    await expectConvexCode(
      t.mutation(api.marketplace.rankings.mutations.publishRankingFromBoard, {
        boardExternalId: 'missing-board',
        visibility: 'public',
      }),
      CONVEX_ERROR_CODES.unauthenticated
    )
  })
})
