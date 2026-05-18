// tests/convex/rankingSeeds.test.ts
// Convex ranking seed preflight & release lifecycle coverage

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import { api, internal } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { SeedRankingsManifest } from '@convex/marketplace/rankings/seed/validators'
import {
  formatBoardSeedId,
  formatRankingSeedId,
} from '@convex/marketplace/rankings/seed/naming'
import type { MarketplaceTemplateCriterionSnapshot } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import schema from '../../convex/schema'
import { BATCH_LIMITS } from '../../convex/lib/limits'
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
      internal.marketplace.rankings.seed.actions.preflightSeedRankings,
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
      internal.marketplace.rankings.seed.actions.preflightSeedRankings,
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

  it('preflights curated symbolic tier names distinctly', async () =>
  {
    const t = makeTest()
    await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:symbolic-tiers',
      labels: ['Steve', 'Sonic'],
    })

    const result = await t.query(
      internal.marketplace.rankings.seed.actions.preflightSeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        rankingSeeds: rankingManifest({
          templateExternalId: 'test:symbolic-tiers',
          curatedLabels: ['Steve', 'Sonic'],
          coverage: 'full-template',
          curatedTiers: [
            { name: 'S+', colorSpec: { kind: 'palette', index: 0 } },
            { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
          ],
          curatedTierGroups: [
            { tierName: 'S+', labels: ['Steve'] },
            { tierName: 'S', labels: ['Sonic'] },
          ],
        }),
      }
    )

    expect(
      result.diagnostics.filter((item) => item.severity === 'error')
    ).toEqual([])
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

  it('verifies applied ranking seed identities, not just totals', async () =>
  {
    const t = makeTest()
    const templateExternalId = 'test:verify-identities'
    const current = await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId,
      labels: ['Mario'],
    })
    const manifest = rankingManifest({
      templateExternalId,
      curatedLabels: ['Mario'],
      coverage: 'full-template',
    })
    const plannedSample = await seedRankingRow(t, {
      templateId: current.templateId,
      templateExternalId,
      releaseId: RELEASE,
      status: 'applied_hidden',
      stableKey: 'planned-sample',
    })
    await t.run(async (ctx) =>
    {
      await ctx.db.patch(plannedSample.rankingId, {
        seedExternalId: formatRankingSeedId({
          templateExternalId,
          criterionExternalId: 'competitive',
          kind: 'sample',
          stableKey: 'ava',
        }),
      })
    })
    await seedRankingRow(t, {
      templateId: current.templateId,
      templateExternalId,
      releaseId: RELEASE,
      status: 'applied_hidden',
      stableKey: 'stale-identity',
    })

    const result = await t.query(
      internal.marketplace.rankings.seed.actions.verifySeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        rankingSeeds: manifest,
      }
    )

    expect(result.existingSeedRankings).toBe(2)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missingSeedRanking',
          message: expect.stringContaining(
            `${templateExternalId}:competitive:curated:fixture-curated`
          ),
        }),
        expect.objectContaining({
          code: 'staleSeedRanking',
          message: expect.stringContaining('ranking:stale-identity'),
        }),
      ])
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
      internal.marketplace.rankings.seed.lifecycle.activateSeedRankings,
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

    const idempotent = await t.mutation(
      internal.marketplace.rankings.seed.lifecycle.activateSeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
      }
    )
    expect(idempotent.activatedRankings).toBe(0)
    expect(idempotent.rolledBackRankings).toBe(0)
    expect(idempotent.aggregateJobsQueued).toBe(0)

    const rolledBack = await t.mutation(
      internal.marketplace.rankings.seed.lifecycle.rollbackSeedRankings,
      {
        datasetKey: DATASET,
        targetReleaseId: OLD_RELEASE,
      }
    )
    expect(rolledBack.activatedRankings).toBe(1)
    expect(rolledBack.rolledBackRankings).toBe(1)
    const rollbackRows = await t.run(async (ctx) =>
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
    expect(rollbackRows.currentRanking?.seedReleaseStatus).toBe('rolled_back')
    expect(rollbackRows.currentBoard?.seedReleaseStatus).toBe('rolled_back')
    expect(rollbackRows.previousRanking?.seedReleaseStatus).toBe('active')
    expect(rollbackRows.previousBoard?.seedReleaseStatus).toBe('active')
  })

  it('rejects activation and rollback when the target release has no ranking rows', async () =>
  {
    const t = makeTest()
    await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:empty-target-release',
      labels: ['Mario'],
    })
    const previous = await seedSeedTemplate(t, {
      releaseId: OLD_RELEASE,
      templateExternalId: 'test:active-before-empty-target',
      labels: ['Mario'],
    })
    const previousSeed = await seedRankingRow(t, {
      templateId: previous.templateId,
      templateExternalId: 'test:active-before-empty-target',
      releaseId: OLD_RELEASE,
      status: 'active',
      stableKey: 'active-before-empty-target',
    })

    await expect(
      t.mutation(
        internal.marketplace.rankings.seed.lifecycle.activateSeedRankings,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
        }
      )
    ).rejects.toThrow(/no active or activatable rows/)
    await expect(
      t.mutation(
        internal.marketplace.rankings.seed.lifecycle.rollbackSeedRankings,
        {
          datasetKey: DATASET,
          targetReleaseId: RELEASE,
        }
      )
    ).rejects.toThrow(/no active or activatable rows/)

    const previousRows = await t.run(async (ctx) =>
    {
      const [ranking, board] = await Promise.all([
        ctx.db.get(previousSeed.rankingId),
        ctx.db.get(previousSeed.boardId),
      ])
      return { ranking, board }
    })
    expect(previousRows.ranking?.publicationState).toBe('published')
    expect(previousRows.ranking?.isPubliclyListable).toBe(true)
    expect(previousRows.ranking?.seedReleaseStatus).toBe('active')
    expect(previousRows.board?.seedReleaseStatus).toBe('active')
  })

  it('rolls back active rows when the target release fills the old active scan window', async () =>
  {
    const t = makeTest()
    const target = await seedSeedTemplate(t, {
      releaseId: OLD_RELEASE,
      templateExternalId: 'test:rollback-target-window',
      labels: ['Mario'],
    })
    const current = await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:rollback-current-window',
      labels: ['Mario'],
    })
    const targetActiveCount =
      BATCH_LIMITS.rankingSeedLifecycleTransition * 4 + 1
    await seedRankingRowsWithoutBoards(t, {
      templateId: target.templateId,
      templateExternalId: 'test:rollback-target-window',
      releaseId: OLD_RELEASE,
      status: 'active',
      stableKeyPrefix: 'rollback-target-window',
      count: targetActiveCount,
    })
    const currentRows = await seedRankingRowsWithoutBoards(t, {
      templateId: current.templateId,
      templateExternalId: 'test:rollback-current-window',
      releaseId: RELEASE,
      status: 'active',
      stableKeyPrefix: 'rollback-current-window',
      count: 1,
    })

    const result = await t.mutation(
      internal.marketplace.rankings.seed.lifecycle.rollbackSeedRankings,
      {
        datasetKey: DATASET,
        targetReleaseId: OLD_RELEASE,
        queueAggregates: false,
      }
    )

    expect(result.activatedRankings).toBe(0)
    expect(result.rolledBackRankings).toBe(1)
    const currentRanking = await t.run(
      async (ctx) => await ctx.db.get(currentRows[0]!)
    )
    expect(currentRanking?.publicationState).toBe('unpublished')
    expect(currentRanking?.isPubliclyListable).toBe(false)
    expect(currentRanking?.isFeatured).toBe(false)
    expect(currentRanking?.seedReleaseStatus).toBe('rolled_back')
  })

  it('skips unchanged sample rankings without resetting active seed rows', async () =>
  {
    const t = makeTest()
    await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:unchanged-sample',
      labels: ['Mario', 'Luigi'],
    })
    await seedUser(t, 'seed+rankings-ava@tierlistbuilder.local')
    const manifest = rankingManifest({
      templateExternalId: 'test:unchanged-sample',
      curatedLabels: ['Mario', 'Luigi'],
      coverage: 'full-template',
    })
    const target = manifest.targets[0]
    const lane = target.lanes[0]
    const profile = manifest.profiles[0]
    const sampleTask = {
      kind: 'sample' as const,
      criterionExternalId: lane.criterionExternalId,
      profileKey: profile.key,
      sequence: 1,
    }
    const callUpsert = async (
      rankingSeeds: typeof manifest,
      task: typeof sampleTask
    ) =>
      await t.mutation(
        internal.marketplace.rankings.seed.actions
          .upsertSeedRankingsForTemplateImpl,
        {
          datasetKey: DATASET,
          releaseId: RELEASE,
          rankingSeeds,
          templateExternalId: target.templateExternalId,
          tasks: [task],
        }
      )

    const first = await callUpsert(manifest, sampleTask)
    expect(first.rankingsDeleted).toBe(0)
    expect(first.rankingsUnchanged).toBe(0)
    expect(first.itemsWritten).toBe(2)

    const activated = await t.mutation(
      internal.marketplace.rankings.seed.lifecycle.activateSeedRankings,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        queueAggregates: false,
      }
    )
    expect(activated.activatedRankings).toBe(1)
    const activeRows = await loadSampleSeedRows(t, {
      templateExternalId: 'test:unchanged-sample',
      criterionExternalId: 'competitive',
      profileKey: 'ava',
    })
    expect(activeRows.ranking?.seedReleaseStatus).toBe('active')
    expect(activeRows.ranking?.sourceBoardId).toBeNull()
    expect(activeRows.board).toBeNull()
    const storedItems = await t.run(async (ctx) =>
    {
      if (!activeRows.ranking) return []
      return await ctx.db
        .query('publishedRankingItems')
        .withIndex('byRanking', (q) =>
          q.eq('rankingId', activeRows.ranking!._id)
        )
        .collect()
    })
    expect(storedItems).toHaveLength(2)
    expect(storedItems.map((item) => item.externalId).sort()).toEqual([
      'item-0',
      'item-1',
    ])
    expect(
      storedItems.map((item) => item.templateItemExternalId).sort()
    ).toEqual(['item-0', 'item-1'])
    expect(storedItems.map((item) => item.label).sort()).toEqual([
      'Luigi',
      'Mario',
    ])
    expect(storedItems.every((item) => item.mediaAssetId === null)).toBe(true)
    const detail = activeRows.ranking
      ? await t.query(
          api.marketplace.rankings.public.queries.getRankingBySlug,
          {
            slug: activeRows.ranking.slug,
          }
        )
      : null
    expect(detail?.items.map((item) => item.label).sort()).toEqual([
      'Luigi',
      'Mario',
    ])
    expect(
      detail?.items.map((item) => item.templateItemExternalId).sort()
    ).toEqual(['item-0', 'item-1'])

    const second = await callUpsert(manifest, sampleTask)
    expect(second.rankingsDeleted).toBe(0)
    expect(second.boardsDeleted).toBe(0)
    expect(second.rankingsUnchanged).toBe(1)
    expect(second.tiersWritten).toBe(0)
    expect(second.itemsWritten).toBe(0)

    const unchangedRows = await loadSampleSeedRows(t, {
      templateExternalId: 'test:unchanged-sample',
      criterionExternalId: 'competitive',
      profileKey: 'ava',
    })
    expect(unchangedRows.ranking?._id).toBe(activeRows.ranking?._id)
    expect(unchangedRows.board).toBeNull()
    expect(unchangedRows.ranking?.seedReleaseStatus).toBe('active')

    const changedManifest: typeof manifest = {
      ...manifest,
      targets: [
        {
          ...target,
          lanes: [{ ...lane, titleSuffix: 'changed fixture ranking' }],
        },
      ],
    }
    const changed = await callUpsert(changedManifest, sampleTask)
    expect(changed.rankingsDeleted).toBe(1)
    expect(changed.boardsDeleted).toBe(0)
    expect(changed.rankingsUnchanged).toBe(0)
    expect(changed.itemsWritten).toBe(2)
    const changedRows = await loadSampleSeedRows(t, {
      templateExternalId: 'test:unchanged-sample',
      criterionExternalId: 'competitive',
      profileKey: 'ava',
    })
    expect(changedRows.ranking?._id).not.toBe(activeRows.ranking?._id)
    expect(changedRows.ranking?.sourceBoardId).toBeNull()
    expect(changedRows.board).toBeNull()
    expect(changedRows.ranking?.seedReleaseStatus).toBe('applied_hidden')
  })

  it('cleans current-release seed rankings omitted from the manifest', async () =>
  {
    const t = makeTest()
    const current = await seedSeedTemplate(t, {
      releaseId: RELEASE,
      templateExternalId: 'test:stale-cleanup',
      labels: ['Mario'],
    })
    const staleSeed = await seedRankingRow(t, {
      templateId: current.templateId,
      templateExternalId: 'test:stale-cleanup',
      releaseId: RELEASE,
      status: 'active',
      stableKey: 'stale-cleanup-a',
    })
    const secondStaleSeed = await seedRankingRow(t, {
      templateId: current.templateId,
      templateExternalId: 'test:stale-cleanup',
      releaseId: RELEASE,
      status: 'active',
      stableKey: 'stale-cleanup-b',
    })

    const first = await t.mutation(
      internal.marketplace.rankings.seed.actions.deleteStaleSeedRankingRowsImpl,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        plannedSeedExternalIds: [],
        cursor: null,
      }
    )
    expect(first.rankingsDeleted).toBe(1)
    expect(first.boardsDeleted).toBe(1)
    expect(first.isDone).toBe(false)

    const second = await t.mutation(
      internal.marketplace.rankings.seed.actions.deleteStaleSeedRankingRowsImpl,
      {
        datasetKey: DATASET,
        releaseId: RELEASE,
        plannedSeedExternalIds: [],
        cursor: first.cursor,
      }
    )
    expect(second.rankingsDeleted).toBe(1)
    expect(second.boardsDeleted).toBe(1)
    expect(second.isDone).toBe(true)
    const rows = await t.run(async (ctx) =>
    {
      const [ranking, board, secondRanking, secondBoard] = await Promise.all([
        ctx.db.get(staleSeed.rankingId),
        ctx.db.get(staleSeed.boardId),
        ctx.db.get(secondStaleSeed.rankingId),
        ctx.db.get(secondStaleSeed.boardId),
      ])
      return { ranking, board, secondRanking, secondBoard }
    })
    expect(rows.ranking).toBeNull()
    expect(rows.board).toBeNull()
    expect(rows.secondRanking).toBeNull()
    expect(rows.secondBoard).toBeNull()
  })
})

const rankingManifest = (args: {
  templateExternalId: string
  curatedLabels: string[]
  coverage: 'full-template' | 'partial-authoritative'
  curatedTiers?: SeedRankingsManifest['targets'][number]['curatedRankings'][number]['tiers']
  curatedTierGroups?: SeedRankingsManifest['targets'][number]['curatedRankings'][number]['tierGroups']
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
          tiers: args.curatedTiers ?? [
            { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
          ],
          tierGroups: args.curatedTierGroups ?? [
            { tierName: 'S', labels: args.curatedLabels },
          ],
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

const seedRankingRowsWithoutBoards = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  args: {
    templateId: Id<'templates'>
    templateExternalId: string
    releaseId: string
    status: 'active' | 'applied_hidden'
    stableKeyPrefix: string
    count: number
  }
): Promise<Id<'publishedRankings'>[]> =>
{
  const ownerId = await seedUser(t)
  return await t.run(async (ctx) =>
  {
    const now = Date.now()
    const rankingIds: Id<'publishedRankings'>[] = []
    for (let index = 0; index < args.count; index++)
    {
      const stableKey = `${args.stableKeyPrefix}-${index}`
      const rankingId = await seedPublishedRanking(ctx, {
        ownerId,
        slug: `ranking-${stableKey}`,
        sourceTemplateId: args.templateId,
        sourceBoardId: null,
        sourceTemplateSlug: args.templateExternalId.replace(/[^a-z0-9]+/g, '-'),
        sourceTemplateTitle: args.templateExternalId,
        title: `${stableKey} ranking`,
        itemCount: 1,
        now,
        publicationState:
          args.status === 'active' ? 'published' : 'unpublished',
        isPubliclyListable: args.status === 'active',
        isFeatured: args.status === 'active',
        featuredRank: 0,
        featuredBadge: 'creator',
        criterion: criterionSnapshot(),
      })
      await ctx.db.patch(rankingId, {
        seedDatasetKey: DATASET,
        seedReleaseId: args.releaseId,
        seedExternalId: `ranking:${stableKey}`,
        seedKind: 'sample',
        seedTemplateExternalId: args.templateExternalId,
        seedCriterionExternalId: 'competitive',
        seedAuthorKey: 'ava',
        seedProfileKey: 'ava',
        seedCuratedExternalId: null,
        seedReleaseStatus: args.status,
      })
      rankingIds.push(rankingId)
    }
    return rankingIds
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

const loadSampleSeedRows = async (
  t: ReturnType<typeof convexTest<typeof schema>>,
  args: {
    templateExternalId: string
    criterionExternalId: string
    profileKey: string
  }
): Promise<{
  ranking: Doc<'publishedRankings'> | null
  board: Doc<'boards'> | null
}> =>
  await t.run(async (ctx) =>
  {
    const idParts = {
      templateExternalId: args.templateExternalId,
      criterionExternalId: args.criterionExternalId,
      kind: 'sample' as const,
      stableKey: args.profileKey,
    }
    const rankingExternalId = formatRankingSeedId(idParts)
    const boardExternalId = formatBoardSeedId(idParts)
    const [ranking, board] = await Promise.all([
      ctx.db
        .query('publishedRankings')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', rankingExternalId)
        )
        .unique(),
      ctx.db
        .query('boards')
        .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
          q
            .eq('seedDatasetKey', DATASET)
            .eq('seedReleaseId', RELEASE)
            .eq('seedExternalId', boardExternalId)
        )
        .unique(),
    ])
    return { ranking, board }
  })
