// convex/lib/userUpsert.ts
// populate app-owned fields after auth library creates/updates a user.
// called from afterUserCreatedOrUpdated; idempotent on repeated sign-ins

import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { newUserExternalId } from './ids'

// run after every sign-in. on first sign-in (no externalId yet) populate
// all app-owned fields; on later sign-ins only bump updatedAt
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
    // existing user — bump updatedAt only. leave displayName alone so the
    // user's manual rename (when we ship that UI) sticks across sign-ins
    await ctx.db.patch(userId, { updatedAt: now })
    return
  }

  // first sign-in — populate app-owned fields. fall back to the auth
  // library's name field for displayName, or the email local-part if no
  // name is present (e.g. github accounts w/o a public display name).
  // guard against malformed email (empty local part) so we don't set an
  // empty displayName that would break downstream UI assumptions
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
  })
}
