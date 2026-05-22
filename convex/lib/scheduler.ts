// convex/lib/scheduler.ts
// small scheduler helpers for paginated maintenance mutations

import type { FunctionReference } from 'convex/server'
import type { MutationCtx } from '../_generated/server'

interface CursorPage
{
  isDone: boolean
  continueCursor: string
}

export const rescheduleIfMore = async <Args extends object>(
  ctx: MutationCtx,
  page: CursorPage,
  ref: FunctionReference<'mutation', 'internal'>,
  args: Args
): Promise<void> =>
{
  if (page.isDone) return
  await ctx.scheduler.runAfter(0, ref, {
    ...args,
    cursor: page.continueCursor,
  })
}
