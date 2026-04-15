// convex/lib/auth.ts
// helpers for resolving the authenticated caller in queries & mutations

import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { getAuthUserId } from '@convex-dev/auth/server'

// resolve the current caller's users row, or null if unauthenticated
export const getCurrentUser = async (
  ctx: QueryCtx
): Promise<Doc<'users'> | null> =>
{
  const userId = await getAuthUserId(ctx)
  if (!userId)
  {
    return null
  }
  return await ctx.db.get(userId as Id<'users'>)
}

// resolve the current caller or throw — used by mutations that require auth
export const requireCurrentUser = async (
  ctx: QueryCtx
): Promise<Doc<'users'>> =>
{
  const user = await getCurrentUser(ctx)
  if (!user)
  {
    throw new Error('not authenticated')
  }
  return user
}
