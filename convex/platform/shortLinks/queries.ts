// convex/platform/shortLinks/queries.ts
// snapshot-share short link queries — public read for slug resolution &
// signed-in listing for the "Recent shares" management surface

import { query } from '../../_generated/server'
import { v } from 'convex/values'
import {
  MAX_OWNED_SHORT_LINKS,
  type OwnedShortLinkListItem,
  type ShortLinkResolveResult,
} from '@tierlistbuilder/contracts/platform/shortLink'
import { getCurrentUserId } from '../../lib/auth'

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

// list the authenticated caller's live snapshot shares, newest first. powers
// the "Recent shares" surface. anon callers see an empty list (anon shares
// have ownerId = null & no surface to manage them — they expire on TTL).
// expired-but-not-yet-reaped rows are filtered out so the listing matches
// the resolve query's "expired = gone" semantics
export const getMyShortLinks = query({
  args: {},
  handler: async (ctx): Promise<OwnedShortLinkListItem[]> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return []
    }

    // byOwner.eq(userId).order('desc') walks the index in reverse — Convex
    // secondary-sorts by _creationTime which matches our createdAt within
    // the same row. cap before the post-filter; expired rows take a slot
    // but the cap is large enough that tail-trimming isn't a real concern
    const rows = await ctx.db
      .query('shortLinks')
      .withIndex('byOwner', (q) => q.eq('ownerId', userId))
      .order('desc')
      .take(MAX_OWNED_SHORT_LINKS)

    const now = Date.now()
    return rows
      .filter((row) => row.expiresAt === null || row.expiresAt > now)
      .map((row) => ({
        slug: row.slug,
        boardTitle: row.boardTitle ?? null,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      }))
  },
})
