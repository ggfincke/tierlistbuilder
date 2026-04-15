// convex/workspace/boards/queries.ts
// board queries — all stubbed; real implementations land in the cloud sync PR

import { query } from '../../_generated/server'
import { v } from 'convex/values'

// list the authenticated caller's boards, newest updated first
// todo: implement in cloud sync PR — return Doc<'boards'>[] filtered by ownerId
export const getMyBoards = query({
  args: {},
  handler: async () =>
  {
    throw new Error('not implemented: getMyBoards — cloud sync PR')
  },
})

// resolve a board by its stable externalId — used for share-link lookup & sync
// todo: implement in cloud sync PR — lookup via byExternalId index
export const getBoardByExternalId = query({
  args: { externalId: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: getBoardByExternalId — cloud sync PR')
  },
})
