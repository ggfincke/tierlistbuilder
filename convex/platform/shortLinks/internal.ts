// convex/platform/shortLinks/internal.ts
// internal short-link functions: createVerifiedSnapshotShortLink (post-envelope-
// verification slug allocation) & gcExpiredShortLinks (daily reap past expiresAt)

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { BATCH_LIMITS } from '../../lib/limits'
import { DEFAULT_SHARE_LINK_TTL_MS } from '@tierlistbuilder/contracts/platform/shortLink'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { ConvexError } from 'convex/values'
import { generateShortLinkSlug } from '@tierlistbuilder/contracts/lib/ids'
import { enforceRateLimit } from '../../lib/rateLimiter'
import { deleteStorageSilently } from '../../lib/storage'

const SLUG_INSERT_MAX_ATTEMPTS = 5

// create a verified short link after the action has stripped the upload
// envelope & stored a clean snapshot blob
export const createVerifiedSnapshotShortLink = internalMutation({
  args: {
    ownerId: v.id('users'),
    snapshotStorageId: v.id('_storage'),
    boardTitle: v.string(),
  },
  returns: v.object({ slug: v.string(), createdAt: v.number() }),
  handler: async (ctx, args): Promise<{ slug: string; createdAt: number }> =>
  {
    await enforceRateLimit(ctx, 'userShortLinkCreate', args.ownerId)

    const boardTitle = normalizeBoardTitle(args.boardTitle)
    const now = Date.now()
    const expiresAt = now + DEFAULT_SHARE_LINK_TTL_MS

    let lastError: unknown = null
    for (let attempt = 0; attempt < SLUG_INSERT_MAX_ATTEMPTS; attempt++)
    {
      const slug = generateShortLinkSlug()
      const collision = await ctx.db
        .query('shortLinks')
        .withIndex('bySlug', (q) => q.eq('slug', slug))
        .unique()

      if (collision)
      {
        continue
      }

      try
      {
        await ctx.db.insert('shortLinks', {
          slug,
          ownerId: args.ownerId,
          snapshotStorageId: args.snapshotStorageId,
          createdAt: now,
          expiresAt,
          boardTitle,
        })
        return { slug, createdAt: now }
      }
      catch (error)
      {
        lastError = error
      }
    }

    // blob cleanup lives in the calling action's catch branch; storage deletes
    // in a mutation would be rolled back by this throw anyway, so don't call
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.slugAllocationFailed,
      message: `failed to allocate a unique short link slug after ${SLUG_INSERT_MAX_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    })
  },
})

// reap shortLinks rows past expiresAt + matching _storage blob. row deleted first
// so a crash leaves only an orphaned blob — caught by the daily gcOrphanedStorage pass.
// inverse order (blob first) would leave a row pointing at a missing blob
export const gcExpiredShortLinks = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args): Promise<{ deleted: number }> =>
  {
    // gt(0) excludes expiresAt === null (index skips nulls) & === 0 (never set in practice).
    // lt(now) bounds the range to expired rows
    const now = Date.now()
    const page = await ctx.db
      .query('shortLinks')
      .withIndex('byExpiresAt', (q) =>
        q.gt('expiresAt', 0).lt('expiresAt', now)
      )
      .paginate({
        numItems: BATCH_LIMITS.expiredLink,
        cursor: args.cursor,
      })

    let deleted = 0
    for (const row of page.page)
    {
      const storageId = row.snapshotStorageId
      await ctx.db.delete(row._id)
      await deleteStorageSilently(ctx, storageId)
      deleted++
    }

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.platform.shortLinks.internal.gcExpiredShortLinks,
        { cursor: page.continueCursor }
      )
    }

    return { deleted }
  },
})
