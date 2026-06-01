// convex/platform/account/cardSync.ts
// marketplace author-card sync helper

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'

export const scheduleAuthorCardSync = async (
  ctx: Pick<MutationCtx, 'scheduler'>,
  userId: Id<'users'>
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
    { authorId: userId, cursor: null }
  )
}
