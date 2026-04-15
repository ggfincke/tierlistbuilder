// convex/platform/media/queries.ts
// media asset queries — stubbed; real implementation lands in media hosting PR

import { query } from '../../_generated/server'
import { v } from 'convex/values'

// resolve a media asset externalId to a signed download URL for rendering
// todo: implement in media hosting PR
export const getMediaAsset = query({
  args: { mediaExternalId: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: getMediaAsset — media hosting PR')
  },
})
