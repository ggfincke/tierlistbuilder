// src/features/workspace/sharing/lib/shortLinkShare.ts
// snapshot-share short link helpers — the encoder side uploads compressed
// snapshot bytes to convex storage & mints a short slug; the decoder side
// resolves the slug, fetches the blob, & runs it through the same inflate
// + parse pipeline as the legacy #share=... fragment decoder (via the
// compressSnapshotBytes / inflateSnapshotBytes helpers in hashShare).
//
// separate file rather than extending hashShare so existing #share= URLs in
// the wild keep decoding through the original helpers w/o ever touching Convex

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { Id } from '@convex/_generated/dataModel'
import { EMBED_ROUTE_PATH } from '~/app/routes/pathname'
import {
  buildAppUrl,
  compressSnapshotBytes,
  inflateSnapshotBytes,
} from './hashShare'
import {
  createSnapshotShortLinkImperative,
  generateSnapshotUploadUrlImperative,
  resolveShortLinkImperative,
} from '~/features/workspace/sharing/data/cloud/shortLinkRepository'

const SHORT_LINK_QUERY_PARAM = 's'

// build a workspace inbound-share URL — recipient lands on the workspace
// route, useAppBootstrap detects the slug & resolves the snapshot
export const getShareUrlFromSlug = (slug: string): string =>
  `${buildAppUrl()}?${SHORT_LINK_QUERY_PARAM}=${encodeURIComponent(slug)}`

// build an embed iframe URL — same slug as the workspace URL but routes
// into the read-only embed shell
export const getEmbedUrlFromSlug = (slug: string): string =>
  `${buildAppUrl(EMBED_ROUTE_PATH)}?${SHORT_LINK_QUERY_PARAM}=${encodeURIComponent(slug)}`

// extract a short-link slug from the current URL's query string. returns
// null when the param is missing or empty so callers can fall through to
// the legacy #share=... fragment path w/o additional checks
export const getShortLinkSlugFromUrl = (): string | null =>
{
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const slug = params.get(SHORT_LINK_QUERY_PARAM)
  return slug && slug.length > 0 ? slug : null
}

// scrub the short-link slug from the address bar w/o triggering navigation.
// matches clearShareFragment's contract — refresh after import shouldn't
// re-trigger the import
export const clearShortLinkSlugFromUrl = (): void =>
{
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (!params.has(SHORT_LINK_QUERY_PARAM)) return

  params.delete(SHORT_LINK_QUERY_PARAM)
  const search = params.toString()
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${
    window.location.hash
  }`
  window.history.replaceState(null, '', next)
}

export interface ShortLinkCreateResult
{
  slug: string
  shareUrl: string
  embedUrl: string
  createdAt: number
}

// orchestrate the full create-link flow: compress -> upload bytes -> mint
// slug. signal supports canceling in-flight requests when a caller supersedes
// (e.g. share modal regenerate) so we don't leak uploads to storage
export const createBoardShortLink = async (
  data: BoardSnapshot,
  signal?: AbortSignal
): Promise<ShortLinkCreateResult> =>
{
  const compressed = await compressSnapshotBytes(data)
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')

  const uploadUrl = await generateSnapshotUploadUrlImperative()
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')

  // wrap in a Blob so the fetch body satisfies TS's BodyInit (Uint8Array
  // is accepted at runtime by every modern engine, but the lib.dom typing
  // narrows BlobPart to Uint8Array<ArrayBuffer> & pako returns the broader
  // Uint8Array<ArrayBufferLike>). cast at the boundary keeps the runtime
  // path zero-copy & matches the pattern used by other binary-fetch sites
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Blob([compressed as BlobPart], {
      type: 'application/octet-stream',
    }),
    signal,
  })

  if (!uploadResponse.ok)
  {
    throw new Error(
      `snapshot upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
    )
  }

  const uploadJson = (await uploadResponse.json()) as {
    storageId: Id<'_storage'>
  }
  if (!uploadJson?.storageId)
  {
    throw new Error('snapshot upload returned no storageId')
  }

  if (signal?.aborted) throw signal.reason ?? new Error('aborted')

  // forward the snapshot's title so the row carries a denormalized label
  // for the signed-in "Recent shares" listing. server normalizes via
  // normalizeBoardTitle (trim + cap), matching the boards table contract
  const { slug, createdAt } = await createSnapshotShortLinkImperative({
    snapshotStorageId: uploadJson.storageId,
    boardTitle: data.title,
  })

  return {
    slug,
    shareUrl: getShareUrlFromSlug(slug),
    embedUrl: getEmbedUrlFromSlug(slug),
    createdAt,
  }
}

// resolve a slug to its decoded BoardSnapshot. throws when the slug is
// unknown / expired / corrupt so callers can show a single error surface
// rather than threading a result discriminator through the UI
export const decodeBoardFromShortLink = async (
  slug: string
): Promise<BoardSnapshot> =>
{
  const result = await resolveShortLinkImperative({ slug })
  if (result.kind === 'not-found')
  {
    throw new Error(`short link not found: ${slug}`)
  }

  const blobResponse = await fetch(result.snapshotUrl)
  if (!blobResponse.ok)
  {
    throw new Error(
      `snapshot fetch failed: ${blobResponse.status} ${blobResponse.statusText}`
    )
  }

  const buffer = await blobResponse.arrayBuffer()
  return inflateSnapshotBytes(new Uint8Array(buffer))
}
