// convex/workspace/boards/mutations.ts
// board mutations — all stubbed; real implementations land in the cloud sync PR

import { mutation } from '../../_generated/server'
import { v } from 'convex/values'

// create a new empty board for the authenticated caller
// todo: implement in cloud sync PR
export const createBoard = mutation({
  args: { title: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: createBoard — cloud sync PR')
  },
})

// rename an existing board owned by the caller
// todo: implement in cloud sync PR
export const updateBoardMeta = mutation({
  args: {
    boardExternalId: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: updateBoardMeta — cloud sync PR')
  },
})

// soft-delete a board — sets deletedAt, does not cascade tiers/items
// todo: implement in cloud sync PR; permanent delete happens in a scheduled job
export const deleteBoard = mutation({
  args: { boardExternalId: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: deleteBoard — cloud sync PR')
  },
})
