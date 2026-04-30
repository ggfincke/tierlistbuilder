// convex/platform/shortLinks/mutations.ts
// snapshot-share mutations — issue token-bound upload URLs & finalize in an action

import { ConvexError, v } from 'convex/values'
import { action, mutation } from '../../_generated/server'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { MAX_BOARD_TITLE_LENGTH } from '@tierlistbuilder/contracts/workspace/board'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { isShortLinkSlug } from '@tierlistbuilder/contracts/lib/ids'
import { getCurrentUserId, requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'
import { internal } from '../../_generated/api'
import { generateUploadToken } from '../../lib/uploadToken'
import {
  UPLOAD_ENVELOPE_MAX_HEADER_BYTES,
  unwrapUploadEnvelope,
} from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import { deleteStorageSilently } from '../../lib/storage'
import type { Id } from '../../_generated/dataModel'

const uploadUrlResultValidator = v.object({
  uploadUrl: v.string(),
  uploadToken: v.string(),
})

// generate a one-time upload URL for the snapshot blob. signed-in only;
// rate-limited separately from slug creation. size cap enforced at
// createSnapshotShortLink; orphaned blobs are reaped by gcOrphanedStorage
export const generateSnapshotUploadUrl = mutation({
  args: {},
  returns: uploadUrlResultValidator,
  handler: async (ctx): Promise<{ uploadUrl: string; uploadToken: string }> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await enforceRateLimit(ctx, 'userShortLink', userId)
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      uploadToken: generateUploadToken(),
    }
  },
})

// link a previously-uploaded snapshot blob to a fresh slug. the action
// verifies the upload envelope, stores a clean snapshot blob, & hands off
// slug allocation to an internal mutation
export const createSnapshotShortLink = action({
  args: {
    snapshotStorageId: v.id('_storage'),
    uploadToken: v.string(),
    boardTitle: v.string(),
  },
  returns: v.object({ slug: v.string(), createdAt: v.number() }),
  handler: async (ctx, args): Promise<{ slug: string; createdAt: number }> =>
  {
    const ownerId = await requireCurrentUserId(ctx)
    if (args.boardTitle.length > MAX_BOARD_TITLE_LENGTH * 2)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `board title too long: ${args.boardTitle.length} chars`,
      })
    }

    // pre-fetch size gate — reject oversized blobs before ctx.storage.get
    // forces a full arrayBuffer() allocation. slack absorbs envelope header
    const storageSize = await ctx.runQuery(
      internal.lib.storage.peekStorageSize,
      { storageId: args.snapshotStorageId }
    )
    if (storageSize === null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.storageMissing,
        message: 'snapshot blob not found in storage',
      })
    }
    if (
      storageSize >
      MAX_SNAPSHOT_COMPRESSED_BYTES + UPLOAD_ENVELOPE_MAX_HEADER_BYTES
    )
    {
      await deleteStorageSilently(ctx, args.snapshotStorageId)
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.payloadTooLarge,
        message: `snapshot blob too large: ${storageSize} > ${MAX_SNAPSHOT_COMPRESSED_BYTES}`,
      })
    }

    const rawBlob = await ctx.storage.get(args.snapshotStorageId)
    if (!rawBlob)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.storageMissing,
        message: 'snapshot blob not found in storage',
      })
    }

    const wrappedBytes = new Uint8Array(await rawBlob.arrayBuffer())
    const payload = unwrapUploadEnvelope(
      'snapshot',
      ownerId,
      args.uploadToken,
      wrappedBytes
    )
    if (!payload)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'upload token mismatch for snapshot blob',
      })
    }

    let cleanStorageId: Id<'_storage'> | null = null
    try
    {
      if (payload.byteLength > MAX_SNAPSHOT_COMPRESSED_BYTES)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.payloadTooLarge,
          message: `snapshot too large: ${payload.byteLength} > ${MAX_SNAPSHOT_COMPRESSED_BYTES} bytes`,
        })
      }

      // cast at the Blob boundary — lib.dom narrows BlobPart to
      // Uint8Array<ArrayBuffer> but subarrays carry ArrayBufferLike. zero-copy
      cleanStorageId = await ctx.storage.store(
        new Blob([payload as BlobPart], { type: 'application/octet-stream' })
      )

      return await ctx.runMutation(
        internal.platform.shortLinks.internal.createVerifiedSnapshotShortLink,
        {
          ownerId,
          snapshotStorageId: cleanStorageId,
          boardTitle: args.boardTitle,
        }
      )
    }
    catch (error)
    {
      if (cleanStorageId)
      {
        await deleteStorageSilently(ctx, cleanStorageId)
      }
      throw error
    }
    finally
    {
      await deleteStorageSilently(ctx, args.snapshotStorageId)
    }
  },
})

// revoke an owned short link. signed-in only; silent no-op when the slug is
// already gone so optimistic UI removes don't error
export const revokeMyShortLink = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isShortLinkSlug(args.slug))
    {
      return null
    }

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
      // surface other users' slugs as forbidden so the caller never learns
      // whether a given slug exists outside their account
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.forbidden,
        message: 'not the owner of this short link',
      })
    }

    const storageId = row.snapshotStorageId
    await ctx.db.delete(row._id)
    await deleteStorageSilently(ctx, storageId)
    return null
  },
})
