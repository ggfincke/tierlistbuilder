// convex/platform/account/sessions.ts
// account session queries & mutations

import { getAuthSessionId } from '@convex-dev/auth/server'
import { v, type Infer } from 'convex/values'
import { internal } from '../../_generated/api'
import { mutation, query } from '../../_generated/server'
import type { PublicUserSession } from '@tierlistbuilder/contracts/platform/user'
import { requireCurrentUserId } from '../../lib/auth'
import {
  getInitialAuthSessionState,
  scheduleAuthSessionCleanup,
} from './cascadeDelete'

// account UI session cap; higher than normal device counts
// keeps listSessions bounded
const SESSION_LIST_LIMIT = 50

const publicUserSessionValidator = v.object({
  _id: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
  isCurrent: v.boolean(),
})

const revokeSessionResultValidator = v.object({
  revokedCurrent: v.boolean(),
})

type _PublicUserSessionMatchesValidator =
  PublicUserSession extends Infer<typeof publicUserSessionValidator>
    ? Infer<typeof publicUserSessionValidator> extends PublicUserSession
      ? true
      : false
    : false
const _publicUserSessionContractCheck: _PublicUserSessionMatchesValidator = true
void _publicUserSessionContractCheck

export const listSessions = query({
  args: {},
  returns: v.array(publicUserSessionValidator),
  handler: async (ctx): Promise<PublicUserSession[]> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const currentSessionId = await getAuthSessionId(ctx)
    const now = Date.now()
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .order('desc')
      .filter((q) => q.gt(q.field('expirationTime'), now))
      .take(SESSION_LIST_LIMIT)

    return sessions.map((session) => ({
      _id: session._id,
      createdAt: session._creationTime,
      expiresAt: session.expirationTime,
      isCurrent: session._id === currentSessionId,
    }))
  },
})

export const revokeSession = mutation({
  args: { sessionId: v.id('authSessions') },
  returns: revokeSessionResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<Infer<typeof revokeSessionResultValidator>> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const session = await ctx.db.get(args.sessionId)
    if (!session || session.userId !== userId)
    {
      return { revokedCurrent: false }
    }
    const currentSessionId = await getAuthSessionId(ctx)
    // delete the row inline so revocation takes effect immediately
    // scheduled cleanup only drains child refresh tokens
    await ctx.db.delete(args.sessionId)
    await ctx.scheduler.runAfter(
      0,
      internal.users.cleanupRevokedSessionTokens,
      { sessionId: args.sessionId, cursor: null }
    )
    return { revokedCurrent: args.sessionId === currentSessionId }
  },
})

// schedule caller auth-session cleanup; the client clears its local token
export const signOutEverywhere = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await scheduleAuthSessionCleanup(
      ctx,
      userId,
      await getInitialAuthSessionState(ctx),
      'signOutOnly'
    )
    return null
  },
})
