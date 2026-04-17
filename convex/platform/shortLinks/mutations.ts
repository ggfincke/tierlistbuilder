// convex/platform/shortLinks/mutations.ts
// snapshot-share short link mutations — anonymous-callable so the share UX works
// for unauthenticated users. signed-in callers get ownerId set; anon callers get null

import { ConvexError, v } from 'convex/values'
import { mutation } from '../../_generated/server'
import {
  DEFAULT_SHARE_LINK_TTL_MS,
  MAX_SNAPSHOT_COMPRESSED_BYTES,
} from '@tierlistbuilder/contracts/platform/shortLink'
import {
  MAX_BOARD_TITLE_LENGTH,
  normalizeBoardTitle,
} from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getCurrentUserId } from '../../lib/auth'
import { newShortLinkSlug } from '../../lib/ids'
import { enforceAnonRateLimit, enforceRateLimit } from '../../lib/rateLimiter'

// 8-char base62 has ~218T combinations; 5 attempts ≈ 1 in 10^60 chance of
// repeated collision. retry on conflict to keep the slug short instead of
// widening the alphabet on a vanishingly-rare collision
const SLUG_INSERT_MAX_ATTEMPTS = 5

// generate a one-time upload URL for the snapshot blob. anon-callable; orphaned blobs
// are reaped by gcOrphanedStorage. size cap enforced at createSnapshotShortLink.
// single rate-limit point for the 2-phase share flow (10/hr per signed-in user,
// 1000/hr global anon bucket) so aborts between phases still count against quota
export const generateSnapshotUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (userId)
    {
      await enforceRateLimit(ctx, 'userShortLink', userId)
    }
    else
    {
      await enforceAnonRateLimit(ctx, 'anonShortLink')
    }
    return await ctx.storage.generateUploadUrl()
  },
})

// link a previously-uploaded snapshot blob to a fresh slug. anon-callable; ownerId set
// when signed in. enforces a byte cap & deletes the blob on failure. expiresAt server-set
// to createdAt + DEFAULT_SHARE_LINK_TTL_MS — no client opt-out for v1.
// rate limit lives on generateSnapshotUploadUrl — one token per share attempt
export const createSnapshotShortLink = mutation({
  args: {
    snapshotStorageId: v.id('_storage'),
    // denormalized board title trimmed server-side via normalizeBoardTitle.
    // stored on the row so getMyShortLinks can render it w/o fetching the blob
    boardTitle: v.string(),
  },
  handler: async (ctx, args): Promise<{ slug: string; createdAt: number }> =>
  {
    const ownerId = await getCurrentUserId(ctx)

    const blobMeta = await ctx.db.system.get(args.snapshotStorageId)
    if (!blobMeta)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.storageMissing,
        message: 'snapshot blob not found in storage',
      })
    }

    if (blobMeta.size > MAX_SNAPSHOT_COMPRESSED_BYTES)
    {
      await ctx.storage.delete(args.snapshotStorageId)
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `snapshot too large: ${blobMeta.size} > ${MAX_SNAPSHOT_COMPRESSED_BYTES} bytes`,
      })
    }

    // belt & suspenders — defend against malformed callers even though the
    // existing share modal already submits a normalized title. cap matches
    // the boards table for consistency
    if (args.boardTitle.length > MAX_BOARD_TITLE_LENGTH * 2)
    {
      await ctx.storage.delete(args.snapshotStorageId)
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `board title too long: ${args.boardTitle.length} chars`,
      })
    }
    const boardTitle = normalizeBoardTitle(args.boardTitle)

    const now = Date.now()
    const expiresAt = now + DEFAULT_SHARE_LINK_TTL_MS

    let lastError: unknown = null
    for (let attempt = 0; attempt < SLUG_INSERT_MAX_ATTEMPTS; attempt++)
    {
      const slug = newShortLinkSlug()
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
          ownerId,
          snapshotStorageId: args.snapshotStorageId,
          createdAt: now,
          expiresAt,
          boardTitle,
        })
        return { slug, createdAt: now }
      }
      catch (error)
      {
        // unique-index race (another tx took the same slug between our
        // lookup & insert). retry w/ a fresh slug
        lastError = error
      }
    }

    await ctx.storage.delete(args.snapshotStorageId)
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.slugAllocationFailed,
      message: `failed to allocate a unique short link slug after ${SLUG_INSERT_MAX_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    })
  },
})

// revoke an owned short link. signed-in only — anon shares expire on TTL.
// silent no-op when slug is already gone so optimistic UI removes don't error.
// row deleted before blob so a crash leaves only an orphaned blob — caught by gcOrphanedStorage
export const revokeMyShortLink = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'not authenticated',
      })
    }

    const row = await ctx.db
      .query('shortLinks')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!row)
    {
      // idempotent — caller's intent (this slug should not exist) already
      // holds. don't surface as an error so the optimistic UI remove
      // doesn't have to special-case "actually it was already gone"
      return null
    }

    if (row.ownerId !== userId)
    {
      // anon shares (ownerId === null) & shares owned by another user.
      // both surface as forbidden so the caller never learns whether the
      // slug exists for someone else
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'not the owner of this short link',
      })
    }

    const storageId = row.snapshotStorageId
    await ctx.db.delete(row._id)

    try
    {
      await ctx.storage.delete(storageId)
    }
    catch
    {
      // blob already gone (manual cleanup, prior crash, etc.). row delete
      // already committed, so the orphan-storage GC will pick up any
      // residue on its next pass. nothing for the caller to act on
    }

    return null
  },
})
