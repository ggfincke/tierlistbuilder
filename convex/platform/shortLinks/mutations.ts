// convex/platform/shortLinks/mutations.ts
// snapshot-share short link mutations. anonymous-callable so the share UX
// works for unauthenticated users (matches today's #share= fragment). signed-in
// callers get ownerId set so they can list their own links later; anon callers
// get ownerId = null

import { ConvexError, v } from 'convex/values'
import { mutation } from '../../_generated/server'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getCurrentUserId } from '../../lib/auth'
import { newShortLinkSlug } from '../../lib/ids'

// 8-char base62 has ~218T combinations; 5 attempts ≈ 1 in 10^60 chance of
// repeated collision. retry on conflict to keep the slug short instead of
// widening the alphabet on a vanishingly-rare collision
const SLUG_INSERT_MAX_ATTEMPTS = 5

// generate a one-time upload URL for the snapshot blob. anon-callable.
// orphaned blobs (upload lands but createSnapshotShortLink never fires)
// are reaped by the gcOrphanedStorage cron; the size cap is enforced at
// createSnapshotShortLink so a single oversized upload still costs bytes
// until the next GC pass
export const generateSnapshotUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.storage.generateUploadUrl(),
})

// link a previously-uploaded snapshot blob to a fresh slug. anon-callable;
// when the caller is signed in, ownerId is set. enforces a compressed-byte
// cap & deletes the blob on validation failure so a runaway upload can't
// squat on storage
export const createSnapshotShortLink = mutation({
  args: { snapshotStorageId: v.id('_storage') },
  handler: async (ctx, args): Promise<{ slug: string; createdAt: number }> =>
  {
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

    const ownerId = await getCurrentUserId(ctx)
    const now = Date.now()

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
          expiresAt: null,
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
