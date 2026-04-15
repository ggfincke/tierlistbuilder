// convex/platform/shortLinks/mutations.ts
// short link mutations — stubbed; real implementations land in short link PR

import { mutation } from '../../_generated/server'
import { v } from 'convex/values'

// generate a one-time upload URL for anonymous snapshot blobs
// todo: implement in short link PR
export const generateSnapshotUploadUrl = mutation({
  args: {},
  handler: async (_ctx) =>
  {
    throw new Error(
      'not implemented: generateSnapshotUploadUrl — short link PR'
    )
  },
})

// create an anonymous snapshot short link — no auth required
// stores the uploaded snapshot blob in _storage, not inline on the shortLinks row
// todo: implement in short link PR
export const createAnonymousSnapshot = mutation({
  args: { snapshotStorageId: v.id('_storage') },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: createAnonymousSnapshot — short link PR')
  },
})

// create a short link for an owned board — requires auth & board ownership
// todo: implement in short link PR
export const createBoardShortLink = mutation({
  args: { boardExternalId: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: createBoardShortLink — short link PR')
  },
})
