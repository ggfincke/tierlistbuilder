// packages/contracts/platform/shortLink.ts
// wire contracts for snapshot-share short links. resolveSlug returns the URL for the compressed
// snapshot blob; frontend inflates & parses it via the shared snapshot codec

// max compressed bytes accepted by createSnapshotShortLink. client enforces
// before upload; server rechecks before shortLinks row insert. covers boards w/
// many items & images while deterring blob-store abuse
export const MAX_SNAPSHOT_COMPRESSED_BYTES = 256 * 1024

// max inflated bytes the client accepts from an inbound share decode.
// DEFLATE's adversarial ratio is ~1032:1 (256KB -> ~260MB), so this cap
// forces early abort on zip-bomb payloads; 16MB covers real-world snapshots w/ headroom
export const MAX_INFLATED_SNAPSHOT_BYTES = 16 * 1024 * 1024

// default TTL applied to new snapshot shares — server-set on every
// createSnapshotShortLink call so gcExpiredShortLinks has a reap target.
// 90 days covers typical share lifecycles w/o letting abandoned blobs accumulate
export const DEFAULT_SHARE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000

// hard cap on live rows returned by getMyShortLinks. server queries the
// owner+expiresAt range, so expired rows do not hide active shares
export const MAX_OWNED_SHORT_LINKS = 200

// returned when a slug points at no row (deleted, expired, or never existed)
export interface ShortLinkResolveMiss
{
  kind: 'not-found'
}

// returned for a live snapshot — recipient fetches snapshotUrl, inflates,
// & parses via the shared snapshot codec
export interface ShortLinkResolveSnapshot
{
  kind: 'snapshot'
  snapshotUrl: string
  createdAt: number
}

export type ShortLinkResolveResult =
  | ShortLinkResolveSnapshot
  | ShortLinkResolveMiss

// signed-in "Recent shares" listing row
export interface OwnedShortLinkListItem
{
  slug: string
  boardTitle: string
  createdAt: number
  expiresAt: number
}
