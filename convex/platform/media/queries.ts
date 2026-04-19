// convex/platform/media/queries.ts
// media asset queries — resolve externalIds to signed download URLs

import { ConvexError, v } from 'convex/values'
import { query } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getCurrentUserId, requireCurrentUserId } from '../../lib/auth'
import { findOwnedMediaAssetByExternalId } from '../../lib/permissions'

// hard cap per batch — protects the query's document read budget. clients
// chunk their pending batches to fit. 50 covers the common "warm a board"
// burst w/ headroom against Convex's 4096-read per-query limit
const MAX_BATCH_LOOKUP_SIZE = 50

interface MediaAssetLookup
{
  externalId: string
  url: string
  mimeType: string
}

// return validator for the batch lookup — mirrors MediaAssetLookup
const mediaAssetLookupValidator = v.object({
  externalId: v.string(),
  url: v.string(),
  mimeType: v.string(),
})

// resolve a batch of media externalIds to signed download URLs. preserve input
// order so the client can pair results by index, & collapse a board's cloud
// image warm-up to one Convex call instead of N
export const getMediaAssetsByExternalIds = query({
  args: { mediaExternalIds: v.array(v.string()) },
  returns: v.array(v.union(mediaAssetLookupValidator, v.null())),
  handler: async (ctx, args): Promise<Array<MediaAssetLookup | null>> =>
  {
    if (args.mediaExternalIds.length === 0)
    {
      return []
    }

    if (args.mediaExternalIds.length > MAX_BATCH_LOOKUP_SIZE)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `batch lookup exceeds cap of ${MAX_BATCH_LOOKUP_SIZE}`,
      })
    }

    const userId = await requireCurrentUserId(ctx)

    return Promise.all(
      args.mediaExternalIds.map(async (externalId) =>
      {
        const asset = await findOwnedMediaAssetByExternalId(
          ctx,
          externalId,
          userId
        )
        if (!asset)
        {
          return null
        }

        const url = await ctx.storage.getUrl(asset.storageId)
        if (!url)
        {
          return null
        }

        return { externalId, url, mimeType: asset.mimeType }
      })
    )
  },
})

// ! deprecated single-asset lookup — retained as a rollout-safe shim for
// stale client bundles that still reference `getMediaAsset` by name. delete
// once all deployed clients have picked up the batch-aware bundle
export const getMediaAsset = query({
  args: { mediaExternalId: v.string() },
  returns: v.union(
    v.object({ url: v.string(), mimeType: v.string() }),
    v.null()
  ),
  handler: async (
    ctx,
    args
  ): Promise<{ url: string; mimeType: string } | null> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }

    const asset = await findOwnedMediaAssetByExternalId(
      ctx,
      args.mediaExternalId,
      userId
    )
    if (!asset)
    {
      return null
    }

    const url = await ctx.storage.getUrl(asset.storageId)
    if (!url)
    {
      return null
    }

    return { url, mimeType: asset.mimeType }
  },
})
