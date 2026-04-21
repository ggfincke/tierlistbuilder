// convex/lib/storage.ts
// shared storage helpers — best-effort deletes & a pre-fetch size peek so
// actions can reject oversized blobs before pulling bytes into memory

import { v } from 'convex/values'
import { internalQuery } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

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

// peek a storage blob's byte size w/o fetching bytes. cheap gate for actions
// that otherwise would allocate a full arrayBuffer() on an oversized upload.
// returns null when the blob row is missing so callers can surface distinctly
export const peekStorageSize = internalQuery({
  args: { storageId: v.id('_storage') },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, args): Promise<number | null> =>
  {
    const metadata = await ctx.db.system.get(args.storageId)
    return metadata ? metadata.size : null
  },
})
