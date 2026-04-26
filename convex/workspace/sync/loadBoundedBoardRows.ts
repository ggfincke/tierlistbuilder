// convex/workspace/sync/loadBoundedBoardRows.ts
// load one board's sync rows w/ explicit truncation checks

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { BOARD_ITEM_TAKE_LIMIT, BOARD_TIER_TAKE_LIMIT } from '../../lib/limits'

interface HasDb
{
  db: QueryCtx['db']
}

export interface BoardSyncRows
{
  serverTiers: Doc<'boardTiers'>[]
  serverItems: Doc<'boardItems'>[]
}

export const loadBoundedBoardRows = async (
  ctx: HasDb,
  boardId: Id<'boards'>
): Promise<BoardSyncRows> =>
{
  const [serverTiers, serverItems] = await Promise.all([
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', boardId))
      .take(BOARD_TIER_TAKE_LIMIT + 1),
    ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', boardId))
      .take(BOARD_ITEM_TAKE_LIMIT + 1),
  ])

  if (serverTiers.length > BOARD_TIER_TAKE_LIMIT)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `board tier rows exceed the sync read limit of ${BOARD_TIER_TAKE_LIMIT}`,
    })
  }

  if (serverItems.length > BOARD_ITEM_TAKE_LIMIT)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `board item rows exceed the sync read limit of ${BOARD_ITEM_TAKE_LIMIT}`,
    })
  }

  return {
    serverTiers,
    serverItems,
  }
}
