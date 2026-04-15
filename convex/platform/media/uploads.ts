// convex/platform/media/uploads.ts
// media upload mutations — stubbed; real implementation lands in media hosting PR

import { mutation } from '../../_generated/server'
import { v } from 'convex/values'

// generate a one-time upload URL for the frontend to POST image bytes
// returns a convex _storage upload URL; frontend follows up w/ finalizeUpload
// todo: implement in media hosting PR
export const generateUploadUrl = mutation({
  args: {},
  handler: async (_ctx) =>
  {
    throw new Error('not implemented: generateUploadUrl — media hosting PR')
  },
})

// finalize an upload — insert mediaAssets row w/ externalId & contentHash dedup
// todo: implement in media hosting PR
export const finalizeUpload = mutation({
  args: {
    storageId: v.id('_storage'),
    contentHash: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    byteSize: v.number(),
  },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: finalizeUpload — media hosting PR')
  },
})
