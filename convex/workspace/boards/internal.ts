// convex/workspace/boards/internal.ts
// internal-only board helpers — not callable from the client

import { internalMutation } from '../../_generated/server'
import { v } from 'convex/values'

// cascade delete a board's tiers, items, & orphan media assets
// called by a scheduled cleanup job after a board is soft-deleted for N days
// todo: implement in cloud sync PR
export const cascadeDeleteBoard = internalMutation({
  args: { boardId: v.id('boards') },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: cascadeDeleteBoard — cloud sync PR')
  },
})
