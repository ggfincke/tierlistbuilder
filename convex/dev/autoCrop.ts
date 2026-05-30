// convex/dev/autoCrop.ts
// dev tool: load auto-crop targets & write computed crop transforms onto sample
// published-ranking items. image decode + math live in the node action sibling

import { ConvexError, v } from 'convex/values'
import { internalMutation, internalQuery } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { itemTransformValidator } from '../lib/validators/common'
import { loadRankingItems } from '../marketplace/rankings/lib'

const TARGET_EMAIL = 'tterrag456@gmail.com'
const RANKING_SCAN_LIMIT = 300
const SEED_ENABLED_ENV = 'CONVEX_TLOTL_SAMPLE_SEED_ALLOWED'

// dev seeding tools share one opt-in flag so they can't run (read or write) on
// a deployment that hasn't explicitly allowed sample seeding (e.g. prod)
const requireSeedAuthorized = (): void =>
{
  if (process.env[SEED_ENABLED_ENV] !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `auto-crop is disabled - set ${SEED_ENABLED_ENV}=true on this deployment to allow it`,
    })
  }
}

interface TemplatePolicy
{
  boardAspectRatio: number
  isArt: boolean
}

interface AutoCropTarget
{
  itemId: Id<'publishedRankingItems'>
  url: string
  mimeType: string
  aspectRatio: number | null
  boardAspectRatio: number
  rotation: 0 | 90 | 180 | 270
}

// logo boards (uniform/auto plate) want trimming; art boards (autoPlate off)
// are left alone so photos/sprites aren't cropped
export const listAutoCropTargets = internalQuery({
  args: { email: v.optional(v.string()) },
  returns: v.array(
    v.object({
      itemId: v.id('publishedRankingItems'),
      url: v.string(),
      mimeType: v.string(),
      aspectRatio: v.union(v.number(), v.null()),
      boardAspectRatio: v.number(),
      rotation: v.union(
        v.literal(0),
        v.literal(90),
        v.literal(180),
        v.literal(270)
      ),
    })
  ),
  handler: async (ctx, args) =>
  {
    requireSeedAuthorized()
    const email = (args.email ?? TARGET_EMAIL).trim().toLowerCase()
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .unique()
    if (!user) return []

    const rankings = await ctx.db
      .query('publishedRankings')
      .withIndex('byOwnerUpdatedAt', (q) => q.eq('ownerId', user._id))
      .order('desc')
      .take(RANKING_SCAN_LIMIT)

    const policyByTemplate = new Map<string, TemplatePolicy>()
    const targets: AutoCropTarget[] = []

    for (const ranking of rankings)
    {
      let policy = policyByTemplate.get(ranking.sourceTemplateId)
      if (!policy)
      {
        const template = await ctx.db.get(ranking.sourceTemplateId)
        policy = {
          boardAspectRatio: template?.itemAspectRatio ?? 1,
          isArt: template?.autoPlate?.mode === 'off',
        }
        policyByTemplate.set(ranking.sourceTemplateId, policy)
      }
      if (policy.isArt) continue

      const items = await loadRankingItems(ctx, ranking._id)
      for (const item of items)
      {
        if (!item.mediaAssetId) continue
        const asset = await ctx.db.get(item.mediaAssetId)
        if (!asset) continue
        const variant = asset.editorVariant ?? asset.tileVariant
        const url = await ctx.storage.getUrl(variant.storageId)
        if (!url) continue
        targets.push({
          itemId: item._id,
          url,
          mimeType: variant.mimeType,
          aspectRatio: item.aspectRatio,
          boardAspectRatio: policy.boardAspectRatio,
          rotation: item.transform?.rotation ?? 0,
        })
      }
    }

    return targets
  },
})

export const applyItemTransforms = internalMutation({
  args: {
    items: v.array(
      v.object({
        itemId: v.id('publishedRankingItems'),
        transform: v.union(itemTransformValidator, v.null()),
      })
    ),
  },
  returns: v.object({ patched: v.number() }),
  handler: async (ctx, args) =>
  {
    requireSeedAuthorized()
    for (const { itemId, transform } of args.items)
    {
      await ctx.db.patch(itemId, { transform })
    }
    return { patched: args.items.length }
  },
})
