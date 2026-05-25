// convex/platform/showcase.ts
// tlotl profile showcase reads & writes — owner edit-state, save, & the public
// read-only projection built from the owner's published-ranking lanes

import { v, type Infer } from 'convex/values'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import {
  DEFAULT_SHOWCASE_TIERS,
  MAX_SHOWCASE_PLACED_ITEMS,
  MAX_SHOWCASE_TIERS,
  SHOWCASE_MINI_ITEM_LIMIT,
  SHOWCASE_TILE_MODE_DEFAULT,
  showcaseLaneKey,
  type ProfileShowcaseEditData,
  type ProfileShowcaseSaveInput,
  type PublicProfileShowcase,
  type ShowcaseMiniSnapshot,
  type ShowcaseMiniTier,
  type ShowcasePlacedTile,
  type ShowcasePlacementInput,
  type ShowcaseRankingTile,
  type ShowcaseTier,
  type ShowcaseTileMode,
} from '@tierlistbuilder/contracts/platform/showcase'
import {
  MAX_TIER_DESCRIPTION_LEN,
  MAX_TIER_NAME_LEN,
} from '@tierlistbuilder/contracts/workspace/board'
import { getCurrentUserId, requireCurrentUserId } from '../lib/auth'
import { tierColorSpecValidator } from '../lib/validators/common'
import {
  marketplaceItemRenderFields,
  templateMediaRefValidator,
} from '../lib/validators/marketplace'
import {
  createTemplateProjectionCache,
  type TemplateProjectionCache,
} from '../marketplace/templates/lib/trending'
import { toTemplateMediaRefWithFallback } from '../marketplace/templates/lib/projections'
import {
  isPublishedRankingRow,
  loadRankingItems,
  loadRankingTiers,
  toRankingItemRenderFields,
} from '../marketplace/rankings/lib'

type DbCtx = QueryCtx | MutationCtx

// owner lanes scanned to derive the unranked pool; beyond this the oldest lanes
// won't surface (bounded read per the convex query guidelines)
const SHOWCASE_LANE_SCAN_LIMIT = 300

const showcaseTileModeValidator = v.union(v.literal('cover'), v.literal('mini'))

const showcaseTierValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.union(tierColorSpecValidator, v.null()),
  order: v.number(),
})

const showcaseMiniItemValidator = v.object(marketplaceItemRenderFields)

const showcaseMiniTierValidator = v.object({
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.union(tierColorSpecValidator, v.null()),
  items: v.array(showcaseMiniItemValidator),
})

const showcaseMiniSnapshotValidator = v.object({
  tiers: v.array(showcaseMiniTierValidator),
  itemAspectRatio: v.union(v.number(), v.null()),
})

const showcaseRankingTileValidator = v.object({
  templateId: v.string(),
  criterionExternalId: v.string(),
  rankingSlug: v.string(),
  title: v.string(),
  cover: v.union(templateMediaRefValidator, v.null()),
  mini: v.union(showcaseMiniSnapshotValidator, v.null()),
})

const showcasePlacedTileValidator = v.object({
  ...showcaseRankingTileValidator.fields,
  tierExternalId: v.string(),
  order: v.number(),
})

const profileShowcaseEditDataValidator = v.object({
  tileMode: showcaseTileModeValidator,
  tiers: v.array(showcaseTierValidator),
  placed: v.array(showcasePlacedTileValidator),
  unranked: v.array(showcaseRankingTileValidator),
})

const publicProfileShowcaseTierValidator = v.object({
  ...showcaseTierValidator.fields,
  tiles: v.array(showcaseRankingTileValidator),
})

export const publicProfileShowcaseValidator = v.object({
  tileMode: showcaseTileModeValidator,
  tiers: v.array(publicProfileShowcaseTierValidator),
  placedCount: v.number(),
})

const showcasePlacementInputValidator = v.object({
  tierExternalId: v.string(),
  templateId: v.string(),
  criterionExternalId: v.string(),
  order: v.number(),
})

const profileShowcaseSaveInputValidator = v.object({
  tileMode: showcaseTileModeValidator,
  tiers: v.array(showcaseTierValidator),
  placements: v.array(showcasePlacementInputValidator),
})

// drift guards: contract types & runtime validators must stay identical — same
// bidirectional Infer pattern as getMe / getPublicProfileByHandle
type _EditDataMatches =
  ProfileShowcaseEditData extends Infer<typeof profileShowcaseEditDataValidator>
    ? Infer<
        typeof profileShowcaseEditDataValidator
      > extends ProfileShowcaseEditData
      ? true
      : false
    : false
const _editDataCheck: _EditDataMatches = true
void _editDataCheck

type _PublicMatches =
  PublicProfileShowcase extends Infer<typeof publicProfileShowcaseValidator>
    ? Infer<typeof publicProfileShowcaseValidator> extends PublicProfileShowcase
      ? true
      : false
    : false
const _publicCheck: _PublicMatches = true
void _publicCheck

type _SaveMatches =
  ProfileShowcaseSaveInput extends Infer<
    typeof profileShowcaseSaveInputValidator
  >
    ? Infer<
        typeof profileShowcaseSaveInputValidator
      > extends ProfileShowcaseSaveInput
      ? true
      : false
    : false
const _saveCheck: _SaveMatches = true
void _saveCheck

const findShowcase = async (
  ctx: DbCtx,
  ownerId: Id<'users'>
): Promise<Doc<'profileShowcases'> | null> =>
  await ctx.db
    .query('profileShowcases')
    .withIndex('byOwner', (q) => q.eq('ownerId', ownerId))
    .unique()

const loadShowcaseTiers = async (
  ctx: DbCtx,
  showcaseId: Id<'profileShowcases'>
): Promise<Doc<'profileShowcaseTiers'>[]> =>
  await ctx.db
    .query('profileShowcaseTiers')
    .withIndex('byShowcase', (q) => q.eq('showcaseId', showcaseId))
    .take(MAX_SHOWCASE_TIERS + 1)

const loadShowcasePlacements = async (
  ctx: DbCtx,
  showcaseId: Id<'profileShowcases'>
): Promise<Doc<'profileShowcaseItems'>[]> =>
  await ctx.db
    .query('profileShowcaseItems')
    .withIndex('byShowcase', (q) => q.eq('showcaseId', showcaseId))
    .take(MAX_SHOWCASE_PLACED_ITEMS + 1)

const toShowcaseTier = (tier: Doc<'profileShowcaseTiers'>): ShowcaseTier => ({
  externalId: tier.externalId,
  name: tier.name,
  description: tier.description ?? null,
  colorSpec: tier.colorSpec,
  rowColorSpec: tier.rowColorSpec ?? null,
  order: tier.order,
})

// distinct lanes the owner has a published ranking for, each mapped to its
// current (newest published) ranking. desc scan -> first seen per lane wins
const loadOwnerLaneRankings = async (
  ctx: DbCtx,
  ownerId: Id<'users'>
): Promise<Map<string, Doc<'publishedRankings'>>> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('byOwnerUpdatedAt', (q) => q.eq('ownerId', ownerId))
    .order('desc')
    .take(SHOWCASE_LANE_SCAN_LIMIT)
  const byLane = new Map<string, Doc<'publishedRankings'>>()
  for (const row of rows)
  {
    if (!isPublishedRankingRow(row)) continue
    const key = showcaseLaneKey(
      row.sourceTemplateId,
      row.sourceCriterionExternalId
    )
    if (!byLane.has(key)) byLane.set(key, row)
  }
  return byLane
}

// compact tier-list render of a ranking for the 'mini' tile. only ranked items,
// bounded to SHOWCASE_MINI_ITEM_LIMIT to keep the read cheap & the tile legible
const buildMiniSnapshot = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>,
  template: Doc<'templates'> | null,
  cache: TemplateProjectionCache
): Promise<ShowcaseMiniSnapshot | null> =>
{
  const [tiers, items] = await Promise.all([
    loadRankingTiers(ctx, ranking._id),
    loadRankingItems(ctx, ranking._id),
  ])
  const ranked = items
    .filter((item) => item.tierExternalId !== null)
    .slice(0, SHOWCASE_MINI_ITEM_LIMIT)
  if (ranked.length === 0) return null

  const byTier = new Map<string, Doc<'publishedRankingItems'>[]>()
  for (const item of ranked)
  {
    const key = item.tierExternalId as string
    const bucket = byTier.get(key)
    if (bucket) bucket.push(item)
    else byTier.set(key, [item])
  }

  const miniTiers: ShowcaseMiniTier[] = []
  for (const tier of tiers)
  {
    const tierItems = byTier.get(tier.externalId)
    if (!tierItems || tierItems.length === 0) continue
    miniTiers.push({
      colorSpec: tier.colorSpec,
      rowColorSpec: tier.rowColorSpec,
      items: await Promise.all(
        tierItems.map((item) => toRankingItemRenderFields(ctx, item, cache))
      ),
    })
  }
  if (miniTiers.length === 0) return null
  return {
    tiers: miniTiers,
    itemAspectRatio: template?.itemAspectRatio ?? null,
  }
}

// lane identity + resolved render payload. cover always resolves (cheap); mini
// only when the active mode needs it
const buildLaneTile = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>,
  tileMode: ShowcaseTileMode,
  cache: TemplateProjectionCache
): Promise<ShowcaseRankingTile> =>
{
  const template = await ctx.db.get(ranking.sourceTemplateId)
  const cover = template
    ? await toTemplateMediaRefWithFallback(
        ctx,
        template.coverMediaAssetId,
        ['preview', 'tile'],
        cache
      )
    : null
  const mini =
    tileMode === 'mini'
      ? await buildMiniSnapshot(ctx, ranking, template, cache)
      : null
  return {
    templateId: ranking.sourceTemplateId,
    criterionExternalId: ranking.sourceCriterionExternalId,
    rankingSlug: ranking.slug,
    title: ranking.title,
    cover,
    mini,
  }
}

const buildEditData = async (
  ctx: DbCtx,
  ownerId: Id<'users'>
): Promise<ProfileShowcaseEditData> =>
{
  const showcase = await findShowcase(ctx, ownerId)
  const tileMode: ShowcaseTileMode =
    showcase?.tileMode ?? SHOWCASE_TILE_MODE_DEFAULT
  const cache = createTemplateProjectionCache()
  const laneRankings = await loadOwnerLaneRankings(ctx, ownerId)

  const tiers: ShowcaseTier[] = showcase
    ? (await loadShowcaseTiers(ctx, showcase._id)).map(toShowcaseTier)
    : DEFAULT_SHOWCASE_TIERS

  // placed: stored lanes resolved to tiles, dropping lanes that no longer have
  // a current published ranking (unpublished/deleted)
  const placed: ShowcasePlacedTile[] = []
  const placedKeys = new Set<string>()
  if (showcase)
  {
    const placements = await loadShowcasePlacements(ctx, showcase._id)
    for (const placement of placements)
    {
      const key = showcaseLaneKey(
        placement.templateId,
        placement.criterionExternalId
      )
      if (placedKeys.has(key)) continue
      const ranking = laneRankings.get(key)
      if (!ranking) continue
      placedKeys.add(key)
      const tile = await buildLaneTile(ctx, ranking, tileMode, cache)
      placed.push({
        ...tile,
        tierExternalId: placement.tierExternalId,
        order: placement.order,
      })
    }
  }

  // unranked: the owner's remaining lanes, newest first
  const unranked: ShowcaseRankingTile[] = []
  for (const [key, ranking] of laneRankings)
  {
    if (placedKeys.has(key)) continue
    unranked.push(await buildLaneTile(ctx, ranking, tileMode, cache))
  }

  return { tileMode, tiers, placed, unranked }
}

// public read-only projection used by getPublicProfileByHandle. returns null
// only when no showcase row exists; an empty (placedCount 0) showcase still
// returns so the owner sees the editor CTA & visitors can hide it
export const buildPublicShowcase = async (
  ctx: QueryCtx,
  ownerId: Id<'users'>
): Promise<PublicProfileShowcase | null> =>
{
  const showcase = await findShowcase(ctx, ownerId)
  if (!showcase) return null
  const cache = createTemplateProjectionCache()
  const [tierRows, placements, laneRankings] = await Promise.all([
    loadShowcaseTiers(ctx, showcase._id),
    loadShowcasePlacements(ctx, showcase._id),
    loadOwnerLaneRankings(ctx, ownerId),
  ])

  const tilesByTier = new Map<string, ShowcaseRankingTile[]>()
  const seenLane = new Set<string>()
  let placedCount = 0
  for (const placement of placements)
  {
    const key = showcaseLaneKey(
      placement.templateId,
      placement.criterionExternalId
    )
    if (seenLane.has(key)) continue
    const ranking = laneRankings.get(key)
    if (!ranking) continue
    seenLane.add(key)
    const tile = await buildLaneTile(ctx, ranking, showcase.tileMode, cache)
    const bucket = tilesByTier.get(placement.tierExternalId)
    if (bucket) bucket.push(tile)
    else tilesByTier.set(placement.tierExternalId, [tile])
    placedCount += 1
  }

  return {
    tileMode: showcase.tileMode,
    tiers: tierRows.map((tier) => ({
      ...toShowcaseTier(tier),
      tiles: tilesByTier.get(tier.externalId) ?? [],
    })),
    placedCount,
  }
}

const getOrCreateShowcaseId = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>
): Promise<Id<'profileShowcases'>> =>
{
  const existing = await findShowcase(ctx, ownerId)
  if (existing) return existing._id
  const now = Date.now()
  return await ctx.db.insert('profileShowcases', {
    ownerId,
    tileMode: SHOWCASE_TILE_MODE_DEFAULT,
    createdAt: now,
    updatedAt: now,
  })
}

// trim, cap, & dedupe tiers; reassign order by index. a showcase w/o tiers is
// unusable so an empty result falls back to the starter set
const normalizeShowcaseTiers = (input: ShowcaseTier[]): ShowcaseTier[] =>
{
  const tiers: ShowcaseTier[] = []
  const seen = new Set<string>()
  for (const tier of input)
  {
    if (tiers.length >= MAX_SHOWCASE_TIERS) break
    if (!tier.externalId || seen.has(tier.externalId)) continue
    seen.add(tier.externalId)
    const description = tier.description
      ? tier.description.trim().slice(0, MAX_TIER_DESCRIPTION_LEN) || null
      : null
    tiers.push({
      externalId: tier.externalId,
      name: tier.name.trim().slice(0, MAX_TIER_NAME_LEN),
      description,
      colorSpec: tier.colorSpec,
      rowColorSpec: tier.rowColorSpec,
      order: tiers.length,
    })
  }
  return tiers.length > 0 ? tiers : DEFAULT_SHOWCASE_TIERS
}

interface NormalizedPlacement
{
  tierExternalId: string
  templateId: Id<'templates'>
  criterionExternalId: string
  order: number
}

// keep placements that point at a known tier & a lane w/ a current published
// ranking; dedupe by lane & cap. order reassigned by index (a total order that
// preserves the caller's within-tier sequence)
const normalizeShowcasePlacements = (
  ctx: MutationCtx,
  input: ShowcasePlacementInput[],
  tierIds: ReadonlySet<string>,
  laneRankings: Map<string, Doc<'publishedRankings'>>
): NormalizedPlacement[] =>
{
  const result: NormalizedPlacement[] = []
  const seen = new Set<string>()
  for (const placement of input)
  {
    if (result.length >= MAX_SHOWCASE_PLACED_ITEMS) break
    if (!tierIds.has(placement.tierExternalId)) continue
    const templateId = ctx.db.normalizeId('templates', placement.templateId)
    if (!templateId) continue
    const key = showcaseLaneKey(templateId, placement.criterionExternalId)
    if (seen.has(key) || !laneRankings.has(key)) continue
    seen.add(key)
    result.push({
      tierExternalId: placement.tierExternalId,
      templateId,
      criterionExternalId: placement.criterionExternalId,
      order: result.length,
    })
  }
  return result
}

const replaceShowcaseTiers = async (
  ctx: MutationCtx,
  showcaseId: Id<'profileShowcases'>,
  tiers: ShowcaseTier[]
): Promise<void> =>
{
  const existing = await loadShowcaseTiers(ctx, showcaseId)
  for (const row of existing) await ctx.db.delete(row._id)
  for (const tier of tiers)
  {
    await ctx.db.insert('profileShowcaseTiers', {
      showcaseId,
      externalId: tier.externalId,
      name: tier.name,
      ...(tier.description !== null ? { description: tier.description } : {}),
      colorSpec: tier.colorSpec,
      ...(tier.rowColorSpec !== null
        ? { rowColorSpec: tier.rowColorSpec }
        : {}),
      order: tier.order,
    })
  }
}

const replaceShowcasePlacements = async (
  ctx: MutationCtx,
  showcaseId: Id<'profileShowcases'>,
  placements: NormalizedPlacement[]
): Promise<void> =>
{
  const existing = await loadShowcasePlacements(ctx, showcaseId)
  for (const row of existing) await ctx.db.delete(row._id)
  for (const placement of placements)
  {
    await ctx.db.insert('profileShowcaseItems', {
      showcaseId,
      tierExternalId: placement.tierExternalId,
      templateId: placement.templateId,
      criterionExternalId: placement.criterionExternalId,
      order: placement.order,
    })
  }
}

// owner-only edit-state for the showcase editor. signed-out callers get the
// starter shell so the editor renders before auth resolves
export const getMyProfileShowcase = query({
  args: {},
  returns: profileShowcaseEditDataValidator,
  handler: async (ctx): Promise<ProfileShowcaseEditData> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return {
        tileMode: SHOWCASE_TILE_MODE_DEFAULT,
        tiers: DEFAULT_SHOWCASE_TIERS,
        placed: [],
        unranked: [],
      }
    }
    return await buildEditData(ctx, userId)
  },
})

export const saveProfileShowcase = mutation({
  args: profileShowcaseSaveInputValidator.fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const showcaseId = await getOrCreateShowcaseId(ctx, userId)

    const tiers = normalizeShowcaseTiers(args.tiers)
    const tierIds = new Set(tiers.map((tier) => tier.externalId))
    const laneRankings = await loadOwnerLaneRankings(ctx, userId)
    const placements = normalizeShowcasePlacements(
      ctx,
      args.placements,
      tierIds,
      laneRankings
    )

    await replaceShowcaseTiers(ctx, showcaseId, tiers)
    await replaceShowcasePlacements(ctx, showcaseId, placements)
    await ctx.db.patch(showcaseId, {
      tileMode: args.tileMode,
      updatedAt: Date.now(),
    })
    return null
  },
})
