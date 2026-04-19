// convex/lib/auth.ts
// helpers for resolving the authenticated caller in queries & mutations

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { getAuthUserId } from '@convex-dev/auth/server'

type AuthCtx = QueryCtx | MutationCtx

// resolve the current caller's users row ID, or null if unauthenticated
export const getCurrentUserId = async (
  ctx: AuthCtx
): Promise<Id<'users'> | null> =>
{
  return (await getAuthUserId(ctx)) ?? null
}

// resolve the current caller's users row, or null if unauthenticated
export const getCurrentUser = async (
  ctx: AuthCtx
): Promise<Doc<'users'> | null> =>
{
  const userId = await getCurrentUserId(ctx)
  if (!userId)
  {
    return null
  }
  return await ctx.db.get(userId)
}

// resolve the current caller's user ID or throw — used by auth-required paths
export const requireCurrentUserId = async (
  ctx: AuthCtx
): Promise<Id<'users'>> =>
{
  const userId = await getCurrentUserId(ctx)
  if (!userId)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.unauthenticated,
      message: 'not authenticated',
    })
  }
  return userId
}
