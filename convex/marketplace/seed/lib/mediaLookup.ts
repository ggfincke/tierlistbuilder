// convex/marketplace/seed/lib/mediaLookup.ts
// shared owner-scoped content-hash lookup for seed media variants

import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { SEED_LIMITS } from '../../../lib/limits'

type SeedMediaLookupCtx = QueryCtx | MutationCtx

export type OwnedSeedMediaVariantSet = readonly [
  contentHash: string,
  variants: Doc<'mediaVariants'>[],
]

export type OwnedSeedMediaVariantLookup = {
  variantSets: OwnedSeedMediaVariantSet[]
  assetById: Map<string, Doc<'mediaAssets'>>
}

export const loadOwnedSeedMediaVariantLookup = async (
  ctx: SeedMediaLookupCtx,
  ownerId: Id<'users'>,
  contentHashes: readonly string[]
): Promise<OwnedSeedMediaVariantLookup> =>
{
  const variantSets = await Promise.all(
    contentHashes.map(
      async (contentHash): Promise<OwnedSeedMediaVariantSet> =>
      {
        const variants = await ctx.db
          .query('mediaVariants')
          .withIndex('byContentHash', (q) => q.eq('contentHash', contentHash))
          .take(SEED_LIMITS.mediaVariantsPerHash)
        return [contentHash, variants]
      }
    )
  )
  const assetIds = Array.from(
    new Set(
      variantSets.flatMap(([, variants]) =>
        variants.map((variant) => variant.mediaAssetId as string)
      )
    )
  ) as Id<'mediaAssets'>[]
  const assets = await Promise.all(assetIds.map((id) => ctx.db.get(id)))
  const assetById = new Map<string, Doc<'mediaAssets'>>()
  for (const asset of assets)
  {
    if (asset && asset.ownerId === ownerId)
    {
      assetById.set(asset._id as string, asset)
    }
  }
  return { variantSets, assetById }
}
