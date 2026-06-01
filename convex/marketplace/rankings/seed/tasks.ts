// convex/marketplace/rankings/seed/tasks.ts
// seed ranking apply-task serialization & resolution

import { ConvexError, v } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { RankingFeaturedBadge } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { assertCountRange } from '../../../lib/assertions'
import { SEED_LIMITS } from '../../../lib/limits'
import type {
  SeedCuratedRanking,
  SeedRankingLane,
  SeedRankingProfile,
  SeedRankingTarget,
  SeedRankingsManifest,
} from './validators'
import {
  curatedAuthorEmail,
  curatedSeedAuthorKey,
  formatBoardSeedId,
  formatRankingSeedId,
  sampleAuthorEmail,
} from './naming'
import {
  featuredForProfile,
  rankTemplateItemsWithScore,
  resolveTemplateTiers,
  scoreLaneItem,
  type RankedSeedItem,
} from './scoring'
import { mapItemsToCuratedTiers } from './curatedResolver'
import type { SeedRankingPlan } from './plan'

const SAMPLE_RANKING_DESCRIPTION =
  'Seeded sample ranking for community feature testing.'

export interface ResolvedTaskInsertArgs
{
  authorKey: string
  authorEmail: string
  title: string
  description: string
  seedExternalId: string
  boardExternalId: string
  seedKind: NonNullable<Doc<'publishedRankings'>['seedKind']>
  seedProfileKey: string | null
  seedCuratedExternalId: string | null
  rankedItems: RankedSeedItem[]
  tiers: readonly TierPresetTier[]
  featuredRank: number | null
  featuredBadge: RankingFeaturedBadge | null
  createdAtOffsetMs: number
  viewCountSeedKey: string
}

const resolveSampleTaskArgs = (
  target: SeedRankingTarget,
  lane: SeedRankingLane,
  profile: SeedRankingProfile,
  template: Doc<'templates'>,
  items: readonly Doc<'templateItems'>[]
): ResolvedTaskInsertArgs =>
{
  const tiers = resolveTemplateTiers(template)
  assertCountRange(
    'template tiers',
    tiers.length,
    1,
    SEED_LIMITS.rankingSeedTiersPerRanking
  )
  const rankedItems = rankTemplateItemsWithScore(items, tiers, (item) =>
    scoreLaneItem(target.templateExternalId, lane, profile, item)
  )
  const featured = featuredForProfile(lane, profile.key)
  const seedExternalId = formatRankingSeedId({
    templateExternalId: target.templateExternalId,
    criterionExternalId: lane.criterionExternalId,
    kind: 'sample',
    stableKey: profile.key,
  })
  return {
    authorKey: profile.key,
    authorEmail: sampleAuthorEmail(profile.key),
    title: `${profile.displayName}'s ${lane.titleSuffix}`,
    description: lane.description || SAMPLE_RANKING_DESCRIPTION,
    seedExternalId,
    boardExternalId: formatBoardSeedId({
      templateExternalId: target.templateExternalId,
      criterionExternalId: lane.criterionExternalId,
      kind: 'sample',
      stableKey: profile.key,
    }),
    seedKind: 'sample',
    seedProfileKey: profile.key,
    seedCuratedExternalId: null,
    rankedItems,
    tiers,
    featuredRank: featured?.featuredRank ?? null,
    featuredBadge: featured?.featuredBadge ?? null,
    createdAtOffsetMs: 60 * 60 * 1000,
    viewCountSeedKey: `views:${profile.key}:${target.templateExternalId}:${lane.criterionExternalId}`,
  }
}

const resolveCuratedTaskArgs = (
  target: SeedRankingTarget,
  curated: SeedCuratedRanking,
  items: readonly Doc<'templateItems'>[]
): ResolvedTaskInsertArgs =>
{
  const authorKey = curatedSeedAuthorKey(curated.authorKey)
  const seedExternalId = formatRankingSeedId({
    templateExternalId: target.templateExternalId,
    criterionExternalId: curated.criterionExternalId,
    kind: 'curated',
    stableKey: curated.externalId,
  })
  return {
    authorKey,
    authorEmail: curatedAuthorEmail(curated.authorKey),
    title: `${curated.authorDisplayName}'s ${curated.title}`,
    description: curated.description,
    seedExternalId,
    boardExternalId: formatBoardSeedId({
      templateExternalId: target.templateExternalId,
      criterionExternalId: curated.criterionExternalId,
      kind: 'curated',
      stableKey: curated.externalId,
    }),
    seedKind: 'curated',
    seedProfileKey: null,
    seedCuratedExternalId: curated.externalId,
    rankedItems: mapItemsToCuratedTiers(
      curated,
      items,
      `${target.templateExternalId}/${curated.externalId}`
    ),
    tiers: curated.tiers,
    featuredRank: curated.featuredRank,
    featuredBadge: curated.featuredBadge,
    createdAtOffsetMs: 15 * 60 * 1000,
    viewCountSeedKey: `views:${authorKey}:${target.templateExternalId}:${curated.criterionExternalId}`,
  }
}

export const serializedApplyTaskValidator = v.union(
  v.object({
    kind: v.literal('sample'),
    criterionExternalId: v.string(),
    profileKey: v.string(),
    sequence: v.number(),
  }),
  v.object({
    kind: v.literal('curated'),
    curatedExternalId: v.string(),
    sequence: v.number(),
  })
)

export type SerializedApplyTask =
  | {
      kind: 'sample'
      criterionExternalId: string
      profileKey: string
      sequence: number
    }
  | {
      kind: 'curated'
      curatedExternalId: string
      sequence: number
    }

export interface SerializedTemplateTaskGroup
{
  templateExternalId: string
  tasks: SerializedApplyTask[]
}

const serializeApplyTask = (
  task: SeedRankingPlan['tasks'][number]
): SerializedApplyTask =>
  task.kind === 'sample'
    ? {
        kind: 'sample',
        criterionExternalId: task.lane.criterionExternalId,
        profileKey: task.profile.key,
        sequence: task.sequence,
      }
    : {
        kind: 'curated',
        curatedExternalId: task.curated.externalId,
        sequence: task.sequence,
      }

export const groupTasksByTemplate = (
  plan: SeedRankingPlan
): SerializedTemplateTaskGroup[] =>
{
  const groups = new Map<string, SerializedApplyTask[]>()
  for (const task of plan.tasks)
  {
    const templateExternalId = task.target.templateExternalId
    const list = groups.get(templateExternalId) ?? []
    list.push(serializeApplyTask(task))
    groups.set(templateExternalId, list)
  }
  return [...groups.entries()].map(([templateExternalId, tasks]) => ({
    templateExternalId,
    tasks,
  }))
}

const SEED_RANKING_TASKS_PER_MUTATION = 4

export const chunkTaskGroup = (
  group: SerializedTemplateTaskGroup
): SerializedTemplateTaskGroup[] =>
{
  if (group.tasks.length <= SEED_RANKING_TASKS_PER_MUTATION) return [group]
  const chunks: SerializedTemplateTaskGroup[] = []
  for (
    let i = 0;
    i < group.tasks.length;
    i += SEED_RANKING_TASKS_PER_MUTATION
  )
  {
    chunks.push({
      templateExternalId: group.templateExternalId,
      tasks: group.tasks.slice(i, i + SEED_RANKING_TASKS_PER_MUTATION),
    })
  }
  return chunks
}

export const seedTemplateTaskBatchResultValidator = v.object({
  rankingsDeleted: v.number(),
  boardsDeleted: v.number(),
  rankingsUnchanged: v.number(),
  tiersWritten: v.number(),
  itemsWritten: v.number(),
  sampleRankingsApplied: v.number(),
  curatedRankingsApplied: v.number(),
})

export type SeedTemplateTaskBatchResult = {
  rankingsDeleted: number
  boardsDeleted: number
  rankingsUnchanged: number
  tiersWritten: number
  itemsWritten: number
  sampleRankingsApplied: number
  curatedRankingsApplied: number
}

export interface ResolvedSeedRankingTask
{
  criterionExternalId: string
  insertArgs: ResolvedTaskInsertArgs
  sampleRankingsApplied: number
  curatedRankingsApplied: number
}

export const resolveSeedRankingTask = (args: {
  rankingSeeds: SeedRankingsManifest
  target: SeedRankingTarget
  task: SerializedApplyTask
  template: Doc<'templates'>
  items: readonly Doc<'templateItems'>[]
}): ResolvedSeedRankingTask =>
{
  const task = args.task
  if (task.kind === 'sample')
  {
    const lane = args.target.lanes.find(
      (entry) => entry.criterionExternalId === task.criterionExternalId
    )
    const profile = args.rankingSeeds.profiles.find(
      (entry) => entry.key === task.profileKey
    )
    if (!lane || !profile)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `apply task references unknown sample lane/profile: ${args.target.templateExternalId}:${task.criterionExternalId}:${task.profileKey}`,
      })
    }
    return {
      criterionExternalId: lane.criterionExternalId,
      insertArgs: resolveSampleTaskArgs(
        args.target,
        lane,
        profile,
        args.template,
        args.items
      ),
      sampleRankingsApplied: 1,
      curatedRankingsApplied: 0,
    }
  }

  const curated = (args.target.curatedRankings ?? []).find(
    (entry) => entry.externalId === task.curatedExternalId
  )
  if (!curated)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `apply task references unknown curated ranking: ${args.target.templateExternalId}:${task.curatedExternalId}`,
    })
  }
  return {
    criterionExternalId: curated.criterionExternalId,
    insertArgs: resolveCuratedTaskArgs(args.target, curated, args.items),
    sampleRankingsApplied: 0,
    curatedRankingsApplied: 1,
  }
}
