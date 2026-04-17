// packages/contracts/platform/shortLink.ts
// wire contracts for the snapshot-share short link primitive. resolveSlug
// returns the URL where the recipient can fetch the compressed snapshot
// blob; the frontend handles inflate + parse the same way the in-URL
// #share=... fragment decoder does

// max compressed bytes accepted by createSnapshotShortLink. cap is enforced
// server-side after the upload lands but before the shortLinks row inserts.
// covers boards w/ many items & deep tier metadata even when image bytes
// have been stripped — generous enough for normal use, narrow enough to
// keep an anonymous-uploadable surface from being abused as a blob store
export const MAX_SNAPSHOT_COMPRESSED_BYTES = 256 * 1024

// default TTL applied to new snapshot shares. server-set on every
// createSnapshotShortLink call so the gcExpiredShortLinks cron has a target
// to reap. 90 days covers typical share lifecycles (a few weeks of active
// reach, then quiet) w/o letting abandoned blobs accumulate forever
export const DEFAULT_SHARE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000

// hard cap on rows returned by getMyShortLinks. mirrors the deleted-boards
// listing convention; pagination is intentionally deferred (TTL keeps the
// listing trim for typical sharing patterns)
export const MAX_OWNED_SHORT_LINKS = 200

// returned when a slug points at no row (deleted, expired, or never existed)
export interface ShortLinkResolveMiss
{
  kind: 'not-found'
}

// returned for a live snapshot — recipient fetches snapshotUrl, inflates,
// & parses w/ the same pipeline that decodes today's #share=... fragments
export interface ShortLinkResolveSnapshot
{
  kind: 'snapshot'
  snapshotUrl: string
  createdAt: number
}

export type ShortLinkResolveResult =
  | ShortLinkResolveSnapshot
  | ShortLinkResolveMiss

// signed-in "Recent shares" listing row. boardTitle may be null for PR 7-era
// rows that predate the denormalized field (UI substitutes "Untitled");
// expiresAt is null only for the same legacy rows since new shares always
// receive a server-set TTL
export interface OwnedShortLinkListItem
{
  slug: string
  boardTitle: string | null
  createdAt: number
  expiresAt: number | null
}
