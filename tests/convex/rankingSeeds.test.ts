// tests/convex/rankingSeeds.test.ts
// Convex ranking seed preflight & release lifecycle coverage

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import { internal } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { SeedRankingsManifest } from '@convex/marketplace/rankings/seedValidators'
import type { MarketplaceTemplateCriterionSnapshot } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import schema from '../../convex/schema'
import {
  modules,
  seedCloudBoard,
  seedPublishedRanking,
  seedPublishedTemplate,
  seedUser,
  withSeedEnv,
} from './convexTestHelpers'

const DATASET = 'marketplace-core'
const RELEASE = '2026-05-templates-v2'
const OLD_RELEASE = '2026-04-templates-v1'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
{
  const t = convexTest({ schema, modules, transactionLimits: true })
  rateLimiter.register(t)
  return t
}

const criteria: Doc<'templates'>['criteria'] = [
  {
    externalId: 'competitive',
    name: 'Competitive',
    shortName: 'Comp',
    prompt: 'Rank by viability.',
    axisTop: 'Strongest',
    axisBottom: 'Weakest',
    order: 0,
    isPrimary: true,
    status: 'active',
  },
  {
    externalId: 'favorites',
    name: 'Favorites',
    shortName: 'Favs',
    prompt: 'Rank by preference.',
    axisTop: 'Favorite',
    axisBottom: 'Least favorite',
    order: 1,
    isPrimary: false,
    status: 'active',
  },
]

const criterionSnapshot = (
  externalId: 'competitive' | 'favorites' = 'competitive'
): MarketplaceTemplateCriterionSnapshot =>
{
  const criterion = criteria.find((item) => item.externalId === externalId)
  if (!criterion) throw new Error(`missing test criterion: ${externalId}`)
  return {
    externalId: criterion.externalId,
    name: criterion.name,
    prompt: criterion.prompt,
  }
}

describe('ranking seed pipeline', () =>
{
  it('preflights curated labels with current item punctuation', async () =>
  {
    const t = makeTest()
    await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:labels',
      labels: ['R.O.B.', 'Mr. Game & Watch', "Link's Awakening"],
    })

    const result = await t.query(
      internal.marketplace.rankings.seed.preflightSeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        rankingSeeds: rankingManifest({
          templateExternalId: 'test:labels',
          curatedLabels: ['Rob', 'Mr Game And Watch', 'Links Awakening'],
          coverage: 'full-template',
        }),
      }
    )

    expect(result.sampleRankingsPlanned).toBe(1)
    expect(result.curatedRankingsPlanned).toBe(1)
    expect(
      result.diagnostics.filter((item) => item.severity === 'error')
    ).toEqual([])
  })

  it('preflight reports invalid curated labels before writes', async () =>
  {
    const t = makeTest()
    await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:missing-label',
      labels: ['Mario'],
    })

    const result = await t.query(
      internal.marketplace.rankings.seed.preflightSeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        rankingSeeds: rankingManifest({
          templateExternalId: 'test:missing-label',
          curatedLabels: ['Not On Template'],
          coverage: 'partial-authoritative',
        }),
      }
    )

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalidCuratedRanking',
          severity: 'error',
        }),
      ])
    )
  })

  it('exposes the seed-gated HTTP preflight route', async () =>
  {
    const t = makeTest()
    await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:http-route',
      labels: ['Mario'],
    })

    const response = await withSeedEnv('test-seed-secret', () =>
      t.fetch('/api/seed/rankings/preflight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-seed-secret',
        },
        body: JSON.stringify({
          datasetKey: DATASET,
          releaseId: RELEASE,
          rankingSeeds: rankingManifest({
            templateExternalId: 'test:http-route',
            curatedLabels: ['Mario'],
            coverage: 'full-template',
          }),
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(
      expect.objectContaining({
        status: 'success',
        value: expect.objectContaining({
          sampleRankingsPlanned: 1,
          curatedRankingsPlanned: 1,
        }),
      })
    )
  })

  it('activates hidden release rankings and rolls back previous active rankings', async () =>
  {
    const t = makeTest()
    const current = await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:current',
      labels: ['Mario'],
    })
    const previous = await seedSeedTemplate(t, {
      releaseId: OLD_RELEASE,
      templateExternalId: 'test:previous',
      labels: ['Mario'],
    })
    const currentSeed = await seedRankingRow(t, {
      templateId: current.templateId,
      templateExternalId: 'test:current',
      releaseId: RELEASE,
      status: 'applied_hidden',
      stableKey: 'current',
    })
    const previousSeed = await seedRankingRow(t, {
      templateId: previous.templateId,
      templateExternalId: 'test:previous',
      releaseId: OLD_RELEASE,
      status: 'active',
      stableKey: 'previous',
    })
    await seedActiveRun(t, OLD_RELEASE)

    const result = await t.mutation(
      internal.marketplace.rankings.seedLifecycle.activateSeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
      }
    )

    expect(result.activatedRankings).toBe(1)
    expect(result.rolledBackRankings).toBe(1)
    const rows = await t.run(async (ctx) =>
    {
      const [currentRanking, previousRanking, currentBoard, previousBoard] =
        await Promise.all([
          ctx.db.get(currentSeed.rankingId),
          ctx.db.get(previousSeed.rankingId),
          ctx.db.get(currentSeed.boardId),
          ctx.db.get(previousSeed.boardId),
        ])
      return { currentRanking, previousRanking, currentBoard, previousBoard }
    })
    expect(rows.currentRanking?.publicationState).toBe('published')
    expect(rows.currentRanking?.isPubliclyListable).toBe(true)
    expect(rows.currentRanking?.isFeatured).toBe(true)
    expect(rows.currentRanking?.seedReleaseStatus).toBe('active')
    expect(rows.currentBoard?.seedReleaseStatus).toBe('active')
    expect(rows.previousRanking?.publicationState).toBe('unpublished')
    expect(rows.previousRanking?.isPubliclyListable).toBe(false)
    expect(rows.previousRanking?.isFeatured).toBe(false)
    expect(rows.previousRanking?.seedReleaseStatus).toBe('rolled_back')
    expect(rows.previousBoard?.seedReleaseStatus).toBe('rolled_back')
  })
})

const rankingManifest = (args: {
  templateExternalId: string
  curatedLabels: string[]
  coverage: 'full-template' | 'partial-authoritative'
}): SeedRankingsManifest => ({
  profileSet: 'fixture-v1',
  defaultProfileCount: 1,
  includeAllTemplates: false,
  profiles: [
    {
      key: 'ava',
      displayName: 'Ava',
      chaos: 0.2,
      contrarian: 0.1,
      boostTermsByTarget: {},
      dropTermsByTarget: {},
    },
  ],
  targets: [
    {
      templateExternalId: args.templateExternalId,
      sampleProfileCount: 1,
      countAsTemplateUse: false,
      lanes: [
        {
          criterionExternalId: 'competitive',
          titleSuffix: 'fixture ranking',
          description: 'Fixture sample ranking.',
          boostTerms: [],
          dropTerms: [],
          profileBoostOverrides: {},
          profileDropOverrides: {},
          chaosMultiplier: 1,
          contrarianMultiplier: 1,
          featuredProfiles: [],
        },
      ],
      curatedRankings: [
        {
          externalId: 'fixture-curated',
          authorKey: 'fixture-author',
          authorDisplayName: 'Fixture Author',
          criterionExternalId: 'competitive',
          title: 'Fixture Curated',
          description: 'Fixture curated ranking.',
          featuredRank: null,
          featuredBadge: null,
          coverage: args.coverage,
          parentLabelByLabel: {},
          tiers: [{ name: 'S', colorSpec: { kind: 'palette', index: 0 } }],
          tierGroups: [{ tierName: 'S', labels: args.curatedLabels }],
        },
      ],
    },
  ],
})

const seedSeedTemplate = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  args: {
    releaseId: string
    templateExternalId: string
    labels: readonly string[]
  }
): Promise<{ authorId: Id<'users'>; templateId: Id<'templates'> }> =>
{
  const authorId = await seedUser(t)
  const templateId = await t.run(async (ctx) =>
  {
    const templateId = await seedPublishedTemplate(ctx, {
      authorId,
      slug: args.templateExternalId.replace(/[^a-z0-9]+/g, '-'),
      title: args.templateExternalId,
      itemCount: args.labels.length,
      sizeClass: 'standard',
      criteria,
    })
    await ctx.db.patch(templateId, {
      seedDatasetKey: DATASET,
      seedExternalId: args.templateExternalId,
      seedReleaseId: args.releaseId,
      seedReleaseStatus: 'applied_hidden',
      itemAspectRatio: 1,
    })
    await Promise.all(
      args.labels.map((label, index) =>
        ctx.db.insert('templateItems', {
          templateId,
          externalId: `item-${index}`,
          label,
          backgroundColor: null,
          altText: label,
          mediaAssetId: null,
          order: index,
          aspectRatio: 1,
          imageFit: null,
          transform: null,
        })
      )
    )
    return templateId
  })
  return { authorId, templateId }
}

const seedRankingRow = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  args: {
    templateId: Id<'templates'>
    templateExternalId: string
    releaseId: string
    status: 'applied_hidden' | 'active'
    stableKey: string
  }
): Promise<{ boardId: Id<'boards'>; rankingId: Id<'publishedRankings'> }> =>
{
  const ownerId = await seedUser(t)
  return await t.run(async (ctx) =>
  {
    const boardExternalId = `board:${args.stableKey}`
    const rankingExternalId = `ranking:${args.stableKey}`
    const now = Date.now()
    const boardId = await seedCloudBoard(ctx, {
      ownerId,
      externalId: boardExternalId,
      title: `${args.stableKey} board`,
      now,
      sourceTemplateId: args.templateId,
      sourceTemplateCategory: 'gaming',
      sourceTemplateSizeClass: 'standard',
      activeItemCount: 1,
    })
    await ctx.db.patch(boardId, {
      seedDatasetKey: DATASET,
      seedReleaseId: args.releaseId,
      seedExternalId: boardExternalId,
      seedKind: 'ranking-sample',
      seedReleaseStatus: args.status,
    })
    const rankingId = await seedPublishedRanking(ctx, {
      ownerId,
      slug: `ranking-${args.stableKey}`,
      sourceTemplateId: args.templateId,
      sourceBoardId: boardId,
      sourceTemplateSlug: args.templateExternalId.replace(/[^a-z0-9]+/g, '-'),
      sourceTemplateTitle: args.templateExternalId,
      title: `${args.stableKey} ranking`,
      itemCount: 1,
      now,
      publicationState: args.status === 'active' ? 'published' : 'unpublished',
      isPubliclyListable: args.status === 'active',
      isFeatured: args.status === 'active',
      featuredRank: 0,
      featuredBadge: 'creator',
      criterion: criterionSnapshot(),
    })
    await ctx.db.patch(rankingId, {
      seedDatasetKey: DATASET,
      seedReleaseId: args.releaseId,
      seedExternalId: rankingExternalId,
      seedKind: 'sample',
      seedTemplateExternalId: args.templateExternalId,
      seedCriterionExternalId: 'competitive',
      seedAuthorKey: 'ava',
      seedProfileKey: 'ava',
      seedCuratedExternalId: null,
      seedReleaseStatus: args.status,
    })
    return { boardId, rankingId }
  })
}

const seedActiveRun = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  releaseId: string
): Promise<void> =>
  await t.run(async (ctx) =>
  {
    await ctx.db.insert('seedRuns', {
      runId: `run-${releaseId}`,
      datasetKey: DATASET,
      releaseId,
      status: 'active',
      finishedAt: Date.now(),
      startedBy: 'ranking seed test',
      templateCount: 1,
      itemCount: 1,
      imageVariantCount: 0,
      error: null,
    })
  })
