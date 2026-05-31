// convex/lib/storage.ts
// shared storage helpers — best-effort deletes & a pre-fetch size peek so
// actions can reject oversized blobs before pulling bytes into memory

import { ConvexError, v } from 'convex/values'
import { internalQuery } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

export interface StorageMetadata
{
  contentType: string | null
  sha256: string
  size: number
}

// accept any ctx that exposes storage.delete (MutationCtx, ActionCtx, or a
// scoped sub-object) so callers don't have to widen to the full ctx type
type StorageDeleteCtx = {
  storage: { delete(storageId: Id<'_storage'>): Promise<void> }
}

// delete a storage blob, swallowing any "already gone" error. safe for
// cleanup paths because gcOrphanedStorage reaps residue on its daily pass
export const deleteStorageSilently = async (
  ctx: StorageDeleteCtx,
  storageId: Id<'_storage'>
): Promise<void> =>
{
  try
  {
    await ctx.storage.delete(storageId)
  }
  catch
  {
    // ignore missing blobs on cleanup paths — orphan GC converges later
  }
}

export const storageSizeExceedsLimit = (
  metadata: Pick<StorageMetadata, 'size'>,
  maxBytes: number,
  slackBytes = 0
): boolean => metadata.size > maxBytes + slackBytes

export const assertStorageMetadataWithinLimit = async (
  ctx: StorageDeleteCtx,
  storageId: Id<'_storage'>,
  metadata: StorageMetadata | null,
  options: {
    label: string
    maxBytes: number
    slackBytes?: number
    requireSha256?: boolean
  }
): Promise<StorageMetadata> =>
{
  if (!metadata)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.storageMissing,
      message: `${options.label} not found in storage`,
    })
  }
  if (options.requireSha256 && !metadata.sha256)
  {
    await deleteStorageSilently(ctx, storageId)
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${options.label} missing storage sha256 metadata`,
    })
  }
  if (
    storageSizeExceedsLimit(metadata, options.maxBytes, options.slackBytes ?? 0)
  )
  {
    await deleteStorageSilently(ctx, storageId)
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.payloadTooLarge,
      message: `${options.label} too large: ${metadata.size} > ${options.maxBytes}`,
    })
  }
  return metadata
}

// peek storage metadata w/o fetching bytes. cheap gate for actions that
// otherwise would allocate a full arrayBuffer() on an oversized upload.
// returns null when the blob row is missing so callers can surface distinctly
export const getStorageMetadata = internalQuery({
  args: { storageId: v.id('_storage') },
  returns: v.union(
    v.null(),
    v.object({
      contentType: v.union(v.string(), v.null()),
      sha256: v.string(),
      size: v.number(),
    })
  ),
  handler: async (ctx, args): Promise<StorageMetadata | null> =>
  {
    const metadata = await ctx.db.system.get(args.storageId)
    return metadata
      ? {
          contentType: metadata.contentType ?? null,
          sha256: metadata.sha256,
          size: metadata.size,
        }
      : null
  },
})
