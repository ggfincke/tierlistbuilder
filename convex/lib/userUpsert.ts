// convex/lib/userUpsert.ts
// populate app-owned fields after auth creates/updates a user; on failure schedules
// retryUpsertAppUserFields w/ bounded backoff so a transient hiccup doesn't lose externalId

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { newUserExternalId } from './ids'

// absolute delay schedule (not relative) so ms math is obvious.
// attempt indices are zero-based — first retry runs at RETRY_SCHEDULE_MS[0]
const RETRY_SCHEDULE_MS = [5_000, 15_000, 60_000] as const
const MAX_RETRY_ATTEMPTS = RETRY_SCHEDULE_MS.length

// run after every sign-in. on first sign-in (no externalId yet) populate
// all app-owned fields; on later sign-ins only bump updatedAt. idempotent
// so repeated invocations from the retry scheduler are safe
export const upsertAppUserFields = async (
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> =>
{
  const user = await ctx.db.get(userId)
  if (!user)
  {
    // auth lib should have created the row before our callback fires;
    // surface a loud error rather than silently dropping the upsert
    throw new Error(
      `upsertAppUserFields: users row ${userId} missing — auth lib did not insert before callback`
    )
  }

  const now = Date.now()

  if (user.externalId)
  {
    // existing user — bump updatedAt only; leave displayName intact across sign-ins.
    // clear any previously-stamped retry diagnostic so lastUpsertError shows only stuck rows
    await ctx.db.patch(userId, {
      updatedAt: now,
      lastUpsertError: undefined,
    })
    return
  }

  // first sign-in — populate app-owned fields. fall back to auth lib's name,
  // then email local-part; guard against empty local-part to avoid a blank displayName
  const emailLocalPart = user.email?.split('@')[0]?.trim()
  const fallbackName =
    user.name ??
    (emailLocalPart && emailLocalPart.length > 0 ? emailLocalPart : 'New user')

  await ctx.db.patch(userId, {
    externalId: newUserExternalId(),
    displayName: fallbackName,
    createdAt: now,
    updatedAt: now,
    tier: 'free',
    lastUpsertError: undefined,
  })
}

// scheduled retry entry point — internal, only callable via ctx.scheduler.
// on success clears the diagnostic; on failure reschedules if budget allows, else
// stamps lastUpsertError. distinct from upsertAppUserFields so scheduler can reference it
export const retryUpsertAppUserFields = internalMutation({
  args: {
    userId: v.id('users'),
    // zero-based attempt counter. 0 => first scheduled retry after the
    // synchronous failure. passed through each reschedule so the backoff
    // ladder stays monotonic
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<void> =>
  {
    try
    {
      await upsertAppUserFields(ctx, args.userId)
    }
    catch (error)
    {
      const nextAttempt = args.attempt + 1
      const message = error instanceof Error ? error.message : String(error)

      if (nextAttempt < MAX_RETRY_ATTEMPTS)
      {
        await ctx.scheduler.runAfter(
          RETRY_SCHEDULE_MS[nextAttempt],
          internal.lib.userUpsert.retryUpsertAppUserFields,
          { userId: args.userId, attempt: nextAttempt }
        )
        return
      }

      // budget exhausted — stamp the diagnostic for operator visibility via lastUpsertError.
      // don't throw: the scheduler would retry again & we've decided to give up
      const user = await ctx.db.get(args.userId)
      if (user)
      {
        await ctx.db.patch(args.userId, {
          lastUpsertError: `retry ${nextAttempt}/${MAX_RETRY_ATTEMPTS} exhausted: ${message}`,
        })
      }
    }
  },
})

// schedule the first retry. exported for the auth callback to call after
// a synchronous upsertAppUserFields failure. returns void so callers can
// fire & forget the handoff to the scheduler
export const scheduleUpsertRetry = async (
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    RETRY_SCHEDULE_MS[0],
    internal.lib.userUpsert.retryUpsertAppUserFields,
    { userId, attempt: 0 }
  )
}
