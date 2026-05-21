// convex/workspace/sync/loadBoundedBoardRows.ts
// load one board's sync rows w/ explicit truncation checks

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { BOARD_TOMBSTONE_RETENTION_MS } from '@tierlistbuilder/contracts/workspace/board'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import {
  BOARD_ITEM_TAKE_LIMIT,
  BOARD_TIER_TAKE_LIMIT,
  MAX_SYNC_ITEMS,
} from '../../lib/limits'

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
  const tombstoneCutoff = Date.now() - BOARD_TOMBSTONE_RETENTION_MS
  const [serverTiers, activeItems] = await Promise.all([
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', boardId))
      .take(BOARD_TIER_TAKE_LIMIT + 1),
    ctx.db
      .query('boardItems')
      .withIndex('byBoardDeletedAtOrder', (q) =>
        q.eq('boardId', boardId).eq('deletedAt', null)
      )
      .take(MAX_SYNC_ITEMS + 1),
  ])

  if (serverTiers.length > BOARD_TIER_TAKE_LIMIT)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `board tier rows exceed the sync read limit of ${BOARD_TIER_TAKE_LIMIT}`,
    })
  }

  if (activeItems.length > MAX_SYNC_ITEMS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `active board item rows exceed the sync read limit of ${MAX_SYNC_ITEMS}`,
    })
  }

  const tombstoneBudget = BOARD_ITEM_TAKE_LIMIT - activeItems.length
  const tombstones =
    tombstoneBudget > 0
      ? await ctx.db
          .query('boardItems')
          .withIndex('byBoardDeletedAtOrder', (q) =>
            q.eq('boardId', boardId).gt('deletedAt', tombstoneCutoff)
          )
          .order('desc')
          .take(tombstoneBudget)
      : []

  return {
    serverTiers,
    serverItems: [...activeItems, ...tombstones],
  }
}
