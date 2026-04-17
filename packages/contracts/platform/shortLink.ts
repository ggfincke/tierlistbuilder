// packages/contracts/platform/shortLink.ts
// wire contracts for snapshot-share short links. resolveSlug returns the URL for the compressed
// snapshot blob; frontend inflates & parses it like the in-URL #share=... fragment decoder

// max compressed bytes accepted by createSnapshotShortLink. cap is enforced
// server-side after upload & before shortLinks row insert. covers boards w/
// many items even after strip-images; narrow enough to deter blob-store abuse
export const MAX_SNAPSHOT_COMPRESSED_BYTES = 256 * 1024

// max inflated bytes the client accepts from an inbound share decode.
// DEFLATE's adversarial ratio is ~1032:1 (256KB -> ~260MB), so this cap
// forces early abort on zip-bomb payloads; 16MB covers real-world snapshots w/ headroom
export const MAX_INFLATED_SNAPSHOT_BYTES = 16 * 1024 * 1024

// default TTL applied to new snapshot shares — server-set on every
// createSnapshotShortLink call so gcExpiredShortLinks has a reap target.
// 90 days covers typical share lifecycles w/o letting abandoned blobs accumulate
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

// signed-in "Recent shares" listing row. boardTitle & expiresAt may be null
// for legacy rows that predate the denormalized fields; UI substitutes
// "Untitled" & new shares always receive a server-set TTL
export interface OwnedShortLinkListItem
{
  slug: string
  boardTitle: string | null
  createdAt: number
  expiresAt: number | null
}
