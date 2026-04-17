// convex/workspace/sync/loadBoundedBoardRows.ts
// load one board's sync rows w/ explicit truncation checks

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { BOARD_ITEM_TAKE_LIMIT, BOARD_TIER_TAKE_LIMIT } from './boardSyncLimits'

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
  const [tierPage, itemPage] = await Promise.all([
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', boardId))
      .paginate({
        numItems: BOARD_TIER_TAKE_LIMIT,
        cursor: null,
      }),
    ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', boardId))
      .paginate({
        numItems: BOARD_ITEM_TAKE_LIMIT,
        cursor: null,
      }),
  ])

  if (!tierPage.isDone)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `board tier rows exceed the sync read limit of ${BOARD_TIER_TAKE_LIMIT}`,
    })
  }

  if (!itemPage.isDone)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `board item rows exceed the sync read limit of ${BOARD_ITEM_TAKE_LIMIT}`,
    })
  }

  return {
    serverTiers: tierPage.page,
    serverItems: itemPage.page,
  }
}
