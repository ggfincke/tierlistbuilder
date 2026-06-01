// tests/convex/profileShowcase.test.ts
// Convex profile-showcase edit-state projections

import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { DEFAULT_SHOWCASE_TIERS } from '@tierlistbuilder/contracts/social/showcase'
import {
  asUser,
  makeTest,
  seedCloudBoard,
  seedPublishedRanking,
  seedPublishedTemplate,
  seedUser,
  type ConvexTestHandle,
} from '@tests/convex/convexTestHelpers'

interface SeedShowcaseRankingResult
{
  templateId: Id<'templates'>
  boardId: Id<'boards'>
  rankingId: Id<'publishedRankings'>
}

const seedShowcaseRanking = async (
  t: ConvexTestHandle,
  ownerId: Id<'users'>,
  tierNames: readonly string[] = ['S']
): Promise<SeedShowcaseRankingResult> =>
  await t.run(async (ctx) =>
  {
    const now = 1_000
    const templateId = await seedPublishedTemplate(ctx, {
      authorId: ownerId,
      slug: 'ShowcaseTpl',
      title: 'Showcase Template',
      itemCount: tierNames.length,
      sizeClass: 'standard',
      now,
    })
    const templateItemIds = await Promise.all(
      tierNames.map((tierName, index) =>
        ctx.db.insert('templateItems', {
          templateId,
          externalId: `showcase-template-item-${index}`,
          label: `${tierName} Template Item`,
          backgroundColor: null,
          altText: null,
          mediaAssetId: null,
          order: index,
          aspectRatio: null,
          imageFit: null,
          transform: null,
          imagePadding: null,
        })
      )
    )
    const boardId = await seedCloudBoard(ctx, {
      ownerId,
      externalId: 'showcase-board',
      title: 'Showcase Board',
      sourceTemplateId: templateId,
      now,
    })
    const rankingId = await seedPublishedRanking(ctx, {
      ownerId,
      slug: 'ShowcaseRank',
      sourceTemplateId: templateId,
      sourceBoardId: boardId,
      sourceTemplateSlug: 'ShowcaseTpl',
      sourceTemplateTitle: 'Showcase Template',
      title: 'Showcase Ranking',
      itemCount: tierNames.length,
      tierCount: tierNames.length,
      now: now + 1,
    })
    // the board-keyed showcase pool resolves tiles via board.livePublicRankingId,
    // so point the seed board at its published ranking
    await ctx.db.patch(boardId, { livePublicRankingId: rankingId })
    await Promise.all(
      tierNames.map((tierName, index) =>
        ctx.db.insert('publishedRankingTiers', {
          rankingId,
          externalId: `showcase-tier-${index}`,
          name: tierName,
          description: null,
          colorSpec: { kind: 'palette', index },
          rowColorSpec: null,
          order: index,
        })
      )
    )
    await Promise.all(
      tierNames.map((tierName, index) =>
        ctx.db.insert('publishedRankingItems', {
          rankingId,
          templateItemId: templateItemIds[index]!,
          templateItemExternalId: `showcase-template-item-${index}`,
          externalId: `showcase-ranking-item-${index}`,
          tierExternalId: `showcase-tier-${index}`,
          label: `${tierName} Pick`,
          backgroundColor: null,
          altText: null,
          mediaAssetId: null,
          order: index,
          aspectRatio: null,
          imageFit: null,
          transform: null,
          imagePadding: null,
        })
      )
    )
    return { templateId, boardId, rankingId }
  })

describe('profile showcase queries', () =>
{
  it('loads cropped mini snapshots for the editor', async () =>
  {
    const t = makeTest()
    const ownerId = await seedUser(
      t,
      'Showcase Owner',
      'showcase-owner@example.com'
    )
    await seedShowcaseRanking(t, ownerId)

    const owner = asUser(t, ownerId)
    const coverMode = await owner.query(
      api.social.showcase.queries.getMyProfileShowcase,
      {}
    )

    expect(coverMode.unranked).toMatchObject([
      expect.objectContaining({
        title: 'Showcase Ranking',
        mini: expect.objectContaining({
          tiers: [
            expect.objectContaining({
              name: 'S',
            }),
          ],
        }),
      }),
    ])
  })

  it('caps cropped mini tiers', async () =>
  {
    const t = makeTest()
    const ownerId = await seedUser(
      t,
      'Showcase Capped Owner',
      'showcase-capped-owner@example.com'
    )
    await seedShowcaseRanking(t, ownerId, ['S', 'A', 'B', 'C', 'D', 'F'])

    const owner = asUser(t, ownerId)
    const data = await owner.query(
      api.social.showcase.queries.getMyProfileShowcase,
      {}
    )
    const mini = data.unranked[0]?.mini

    expect(mini?.tiers.map((tier) => tier.name)).toEqual(['S', 'A', 'B', 'C'])
  })

  it('hides placed public tiles when the source template is no longer reachable', async () =>
  {
    const t = makeTest()
    const ownerId = await seedUser(t, 'showcase-visible@example.com', {
      handle: 'showcase-visible',
      displayName: 'Showcase Visible',
    })
    const seeded = await seedShowcaseRanking(t, ownerId)
    const owner = asUser(t, ownerId)

    await owner.mutation(api.social.showcase.mutations.saveProfileShowcase, {
      tiers: DEFAULT_SHOWCASE_TIERS,
      placements: [
        {
          tierExternalId: DEFAULT_SHOWCASE_TIERS[0]!.externalId,
          boardExternalId: 'showcase-board',
          order: 0,
        },
      ],
    })

    const beforeProfile = await t.query(
      api.social.profile.queries.getPublicProfileByHandle,
      { handle: 'showcase-visible' }
    )
    expect(beforeProfile?.showcase).toMatchObject({ placedCount: 1 })

    await t.run(async (ctx) =>
    {
      await ctx.db.patch(seeded.templateId, {
        publicationState: 'unpublished',
        isPubliclyListable: false,
      })
    })

    const afterProfile = await t.query(
      api.social.profile.queries.getPublicProfileByHandle,
      { handle: 'showcase-visible' }
    )
    expect(afterProfile?.showcase).toMatchObject({ placedCount: 0 })
    expect(
      afterProfile?.showcase?.tiers.every((tier) => tier.tiles.length === 0)
    ).toBe(true)

    const editData = await owner.query(
      api.social.showcase.queries.getMyProfileShowcase,
      {}
    )
    expect(editData.placed).toHaveLength(0)
    expect(editData.unranked).toHaveLength(0)
  })
})
