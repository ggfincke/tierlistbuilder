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
