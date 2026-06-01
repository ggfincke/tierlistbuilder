// convex/social/showcase/internal.ts
// internal helpers for profile-showcase lifecycle cleanup

import type { Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import {
  MAX_SHOWCASE_PLACED_ITEMS,
  MAX_SHOWCASE_TIERS,
} from '@tierlistbuilder/contracts/social/showcase'

export const deleteShowcaseWithChildren = async (
  ctx: MutationCtx,
  showcaseId: Id<'profileShowcases'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('profileShowcaseItems')
      .withIndex('byShowcase', (q) => q.eq('showcaseId', showcaseId))
      .take(MAX_SHOWCASE_PLACED_ITEMS + 1),
    ctx.db
      .query('profileShowcaseTiers')
      .withIndex('byShowcase', (q) => q.eq('showcaseId', showcaseId))
      .take(MAX_SHOWCASE_TIERS + 1),
  ])
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
  ])
  await ctx.db.delete(showcaseId)
}
