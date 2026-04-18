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
import { isShortLinkSlug } from '@tierlistbuilder/contracts/lib/ids'
import { getCurrentUserId } from '../../lib/auth'

// resolve a slug to its snapshot blob URL, or signal a miss. callers distinguish
// missing vs. expired only via the kind tag. recipient flow: resolveSlug -> fetch
// snapshotUrl -> inflate -> BoardSnapshot (same pipeline as #share=... fragment)
export const resolveSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<ShortLinkResolveResult> =>
  {
    // keep this public read cheap in-app: reject malformed slugs before the
    // index lookup. if abuse ever becomes real, apply IP/CDN throttling at
    // the edge instead of a shared anon limiter on a public share path
    if (!isShortLinkSlug(args.slug))
    {
      return { kind: 'not-found' }
    }

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

// list the authenticated caller's live snapshot shares, newest first. anon callers
// get an empty list — anon shares expire on TTL w/ no management surface.
// expired-but-not-yet-reaped rows are filtered so listing matches resolve semantics
export const getMyShortLinks = query({
  args: {},
  handler: async (ctx): Promise<OwnedShortLinkListItem[]> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return []
    }

    // order('desc') walks byOwner in reverse — Convex secondary-sorts by _creationTime.
    // cap before the post-filter; expired rows take a slot but the cap is large enough
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
