// convex/lib/auth.ts
// helpers for resolving the authenticated caller in queries & mutations

import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { getAuthUserId } from '@convex-dev/auth/server'

type AuthCtx = QueryCtx | MutationCtx

// resolve the current caller's users row ID, or null if unauthenticated
export const getCurrentUserId = async (
  ctx: AuthCtx
): Promise<Id<'users'> | null> =>
{
  const userId = await getAuthUserId(ctx)
  return userId ? (userId as Id<'users'>) : null
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
    throw new Error('not authenticated')
  }
  return userId
}

// resolve the current caller or throw — used by mutations that require auth
export const requireCurrentUser = async (
  ctx: AuthCtx
): Promise<Doc<'users'>> =>
{
  const user = await getCurrentUser(ctx)
  if (!user)
  {
    throw new Error('not authenticated')
  }
  return user
}
