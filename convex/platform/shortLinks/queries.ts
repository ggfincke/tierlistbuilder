// convex/platform/shortLinks/queries.ts
// snapshot-share short link queries — public read; recipients of a share URL
// don't need to be authenticated to fetch the snapshot blob URL

import { query } from '../../_generated/server'
import { v } from 'convex/values'
import type { ShortLinkResolveResult } from '@tierlistbuilder/contracts/platform/shortLink'

// resolve a slug to its snapshot blob URL, or signal a miss. callers
// distinguish "deleted" from "never existed" only via the kind tag — we
// don't expose the difference. recipient flow:
//   resolveSlug({ slug }) -> { snapshotUrl, createdAt }
//   fetch(snapshotUrl) -> compressed bytes
//   inflate + parse -> BoardSnapshot (same pipeline as #share=... fragment)
export const resolveSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<ShortLinkResolveResult> =>
  {
    const row = await ctx.db
      .query('shortLinks')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!row)
    {
      return { kind: 'not-found' }
    }

    if (row.expiresAt !== null && row.expiresAt < Date.now())
    {
      // expired but not yet GC'd. treat as a miss so recipients don't get
      // a stale snapshot; the TTL cleanup cron will reap the row separately
      return { kind: 'not-found' }
    }

    const snapshotUrl = await ctx.storage.getUrl(row.snapshotStorageId)
    if (!snapshotUrl)
    {
      // blob missing in storage (manual cleanup, race w/ GC, etc.). same
      // surface as a deleted row from the recipient's perspective
      return { kind: 'not-found' }
    }

    return {
      kind: 'snapshot',
      snapshotUrl,
      createdAt: row.createdAt,
    }
  },
})
