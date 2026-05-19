// convex/dev/resetLock.ts
// shared dev-reset lock helpers for self-rescheduling maintenance jobs

import type { MutationCtx } from '../_generated/server'

export const DEV_RESET_ENABLED_ENV = 'CONVEX_DEV_RESET_ALLOWED'
export const DEV_RESET_LOCK_TTL_MS = 15 * 60 * 1000

const DEV_RESET_LOCK_DELETE_BATCH = 64
// guard against an unbounded loop in releaseDevResetLocks. each pass deletes
// up to DELETE_BATCH rows; 100 passes covers any realistic dev backlog without
// risking infinite churn if a concurrent acquire keeps reinserting
const DEV_RESET_LOCK_RELEASE_MAX_PASSES = 100

const isDevResetEnabledHere = (): boolean =>
  process.env[DEV_RESET_ENABLED_ENV] === 'true'

export const isDevResetActive = async (ctx: MutationCtx): Promise<boolean> =>
{
  // prod never sets the env var, so the lock table is provably empty there;
  // skip the index read so this guard adds zero cost to hot-path mutations
  if (!isDevResetEnabledHere()) return false
  const activeLocks = await ctx.db
    .query('devResetLocks')
    .withIndex('byExpiresAt', (q) => q.gt('expiresAt', Date.now()))
    .take(1)
  return activeLocks.length > 0
}

export const acquireDevResetLock = async (
  ctx: MutationCtx,
  deploymentMarker: string
): Promise<void> =>
{
  const now = Date.now()
  const expired = await ctx.db
    .query('devResetLocks')
    .withIndex('byExpiresAt', (q) => q.lt('expiresAt', now))
    .take(DEV_RESET_LOCK_DELETE_BATCH)
  for (const row of expired)
  {
    await ctx.db.delete(row._id)
  }
  await ctx.db.insert('devResetLocks', {
    deploymentMarker,
    createdAt: now,
    expiresAt: now + DEV_RESET_LOCK_TTL_MS,
  })
}

export const releaseDevResetLocks = async (
  ctx: MutationCtx
): Promise<number> =>
{
  let released = 0
  for (let pass = 0; pass < DEV_RESET_LOCK_RELEASE_MAX_PASSES; pass++)
  {
    const rows = await ctx.db
      .query('devResetLocks')
      .take(DEV_RESET_LOCK_DELETE_BATCH)
    if (rows.length === 0) return released
    for (const row of rows)
    {
      await ctx.db.delete(row._id)
      released += 1
    }
  }
  return released
}
