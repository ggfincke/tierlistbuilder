// src/features/platform/share/shortLinkShare.ts
// snapshot-share short link helpers. decoder resolves & inflates via the
// shared snapshot codec

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { isShortLinkSlug } from '@tierlistbuilder/contracts/lib/ids'
import { buildAppUrl, inflateSnapshotBytes } from '~/shared/sharing/hashShare'
import { assertShortLinkSnapshotSize } from '~/shared/sharing/shortLinkCodec'
import { resolveShortLinkImperative } from '~/features/platform/share/shortLinkRepository'
import { isNonEmptyString } from '~/shared/lib/typeGuards'

const SHORT_LINK_QUERY_PARAM = 's'

type ShortLinkDecodeErrorKind =
  | 'invalid-slug'
  | 'not-found'
  | 'fetch-failed'
  | 'too-large'
  | 'corrupt'

export class ShortLinkDecodeError extends Error
{
  readonly kind: ShortLinkDecodeErrorKind

  constructor(
    kind: ShortLinkDecodeErrorKind,
    message: string,
    options?: ErrorOptions
  )
  {
    super(message, options)
    this.kind = kind
    this.name = 'ShortLinkDecodeError'
  }
}

export const isShortLinkDecodeError = (
  error: unknown
): error is ShortLinkDecodeError => error instanceof ShortLinkDecodeError

const assertBlobSize = (bytes: number): void =>
{
  if (bytes <= MAX_SNAPSHOT_COMPRESSED_BYTES) return
  throw new ShortLinkDecodeError(
    'too-large',
    `short link blob too large: ${bytes} > ${MAX_SNAPSHOT_COMPRESSED_BYTES}`
  )
}

// build a workspace inbound-share URL — recipient lands on the workspace
// route, useAppBootstrap detects the slug & resolves the snapshot
export const getShareUrlFromSlug = (slug: string): string =>
  `${buildAppUrl()}?${SHORT_LINK_QUERY_PARAM}=${encodeURIComponent(slug)}`

// extract the raw short-link query value. callers that need user-facing parse
// errors use this before validation so `?s=broken` doesn't look like no share
export const getRawShortLinkSlugFromUrl = (): string | null =>
{
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const slug = params.get(SHORT_LINK_QUERY_PARAM)
  return isNonEmptyString(slug) ? slug : null
}

// scrub the short-link slug from the address bar w/o triggering navigation.
// refresh after import shouldn't re-trigger the import
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

// resolve a slug to its decoded BoardSnapshot. throws when the slug is
// unknown / expired / corrupt so callers can show a single error surface
// rather than threading a result discriminator through the UI
export const decodeBoardFromShortLink = async (
  slug: string,
  signal?: AbortSignal
): Promise<BoardSnapshot> =>
{
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')
  if (!isShortLinkSlug(slug))
  {
    throw new ShortLinkDecodeError(
      'invalid-slug',
      `invalid short link slug: ${slug}`
    )
  }

  const result = await resolveShortLinkImperative({ slug })
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')
  if (result.kind === 'not-found')
  {
    throw new ShortLinkDecodeError('not-found', `short link not found: ${slug}`)
  }

  const blobResponse = await fetch(result.snapshotUrl, { signal })
  if (!blobResponse.ok)
  {
    throw new ShortLinkDecodeError(
      'fetch-failed',
      `snapshot fetch failed: ${blobResponse.status} ${blobResponse.statusText}`
    )
  }

  // defense-in-depth: server caps legit shares to 256KB, but a misconfigured CDN
  // or forged URL could serve a larger blob — reject before arrayBuffer() allocates
  const contentLengthHeader = blobResponse.headers.get('Content-Length')
  if (contentLengthHeader !== null)
  {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength))
    {
      assertBlobSize(contentLength)
    }
  }

  const buffer = await blobResponse.arrayBuffer()
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')
  // second guard for servers that omit Content-Length (chunked transfer,
  // misconfigured CDN). the Content-Length check above short-circuits
  // when the header is present; this catches the header-less case
  assertBlobSize(buffer.byteLength)
  try
  {
    assertShortLinkSnapshotSize(buffer.byteLength)
    return await inflateSnapshotBytes(new Uint8Array(buffer))
  }
  catch (error)
  {
    throw new ShortLinkDecodeError(
      'corrupt',
      'short link snapshot is damaged or unsupported',
      { cause: error }
    )
  }
}
