// convex/platform/media/queries.ts
// media asset queries — resolve externalId to a signed download URL

import { query } from '../../_generated/server'
import { v } from 'convex/values'
import { getCurrentUserId } from '../../lib/auth'
import { findOwnedMediaAssetByExternalId } from '../../lib/permissions'

// resolve a media asset externalId to a signed download URL
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
