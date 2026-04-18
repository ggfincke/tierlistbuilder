// convex/platform/media/queries.ts
// media asset queries — resolve externalIds to signed download URLs

import { ConvexError, v } from 'convex/values'
import { query } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getCurrentUserId } from '../../lib/auth'
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

// resolve a batch of media externalIds to signed download URLs. preserves
// input order; missing or unowned entries resolve to null so the client can
// pair each input w/ its result by index. single round trip regardless of
// fan-out so a board w/ N cloud images only makes one Convex call
export const getMediaAssetsByExternalIds = query({
  args: { mediaExternalIds: v.array(v.string()) },
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

    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return args.mediaExternalIds.map(() => null)
    }

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
