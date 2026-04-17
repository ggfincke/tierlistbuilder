// src/features/workspace/sharing/lib/hashShare.ts
// shareable link encoding & decoding — compress board data into a URL hash fragment.
// compression pipeline reused by shortLinkShare via compressSnapshotBytes / inflateSnapshotBytes

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  MAX_INFLATED_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_COMPRESSED_BYTES,
} from '@tierlistbuilder/contracts/platform/shortLink'
import { EMBED_ROUTE_PATH, normalizeBasePath } from '~/app/routes/pathname'
import { parseBoardSnapshotJson } from '~/features/workspace/export/lib/exportJson'
import { base64ToBytes, bytesToBase64 } from '~/shared/lib/binaryCodec'
import { mapSnapshotItems } from '~/shared/lib/boardSnapshotItems'

// build an absolute URL for the app, appending the configured base path.
// shared w/ the short-link URL builders
export const buildAppUrl = (pathname = ''): string =>
  `${window.location.origin}${normalizeBasePath()}${pathname}`

// drop image bytes & deleted items from share payloads
export const stripImagesForShare = (data: BoardSnapshot): BoardSnapshot =>
{
  return {
    ...mapSnapshotItems(data, (item) =>
    {
      const { imageRef: _imageRef, imageUrl: _imageUrl, ...rest } = item
      return rest
    }),
    deletedItems: [],
  }
}

// base64url encode a Uint8Array
const toBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

// base64url decode to a Uint8Array
const fromBase64Url = (str: string): Uint8Array =>
{
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return base64ToBytes(padded)
}

// strip -> JSON -> encode -> deflate. raw bytes suitable for binary transport
// (fragment encoder base64url-wraps; short-link encoder uploads as-is)
export const compressSnapshotBytes = async (
  data: BoardSnapshot
): Promise<Uint8Array> =>
{
  const stripped = stripImagesForShare(data)
  const json = JSON.stringify(stripped)
  const bytes = new TextEncoder().encode(json)
  const { deflate } = await import('pako')
  return deflate(bytes)
}

// inflate -> decode -> parseBoardSnapshotJson. uses pako's streaming Inflate to
// early-abort when output exceeds MAX_INFLATED_SNAPSHOT_BYTES, defending against
// zip-bomb payloads (DEFLATE can reach ~1032:1) w/o letting the full expansion allocate
export const inflateSnapshotBytes = async (
  compressed: Uint8Array,
  defaultTitle = 'Shared Tier List'
): Promise<BoardSnapshot> =>
{
  const { Inflate } = await import('pako')
  const inflator = new Inflate()
  // preserve pako's default chunk collection — overriding onData without
  // delegating would leave inflator.result empty
  const defaultOnData = inflator.onData.bind(inflator)
  let totalLength = 0
  let abortedForSize = false
  inflator.onData = (chunk: Uint8Array) =>
  {
    if (abortedForSize) return
    totalLength += chunk.length
    if (totalLength > MAX_INFLATED_SNAPSHOT_BYTES)
    {
      abortedForSize = true
      return
    }
    defaultOnData(chunk)
  }
  inflator.push(compressed, true)

  if (abortedForSize)
  {
    throw new Error(
      `inflated snapshot exceeds the ${MAX_INFLATED_SNAPSHOT_BYTES}-byte cap`
    )
  }
  if (inflator.err)
  {
    throw new Error(`snapshot decompression failed: ${inflator.msg}`)
  }
  const bytes = inflator.result as Uint8Array
  const json = new TextDecoder().decode(bytes)
  return parseBoardSnapshotJson(json, defaultTitle)
}

// encode board data into a compressed base64url string
export const encodeBoardToShareFragment = async (
  data: BoardSnapshot
): Promise<string> =>
{
  const compressed = await compressSnapshotBytes(data)
  return toBase64Url(compressed)
}

// decode a compressed base64url string back to board data.
// mirrors the short-link path's size cap so a malicious URL fragment can't
// drive the decoder into an unbounded allocation before inflation
export const decodeBoardFromShareFragment = async (
  fragment: string
): Promise<BoardSnapshot> =>
{
  const compressed = fromBase64Url(fragment)
  if (compressed.length > MAX_SNAPSHOT_COMPRESSED_BYTES)
  {
    throw new Error(
      `share fragment exceeds the ${MAX_SNAPSHOT_COMPRESSED_BYTES}-byte compressed cap`
    )
  }
  return inflateSnapshotBytes(compressed)
}

// workspace base URL (origin + configured base path)
export const getWorkspaceBaseUrl = (): string => buildAppUrl()

// embed base URL for the dedicated embed route
export const getEmbedBaseUrl = (): string => buildAppUrl(EMBED_ROUTE_PATH)

// build the full shareable URL w/ hash fragment
export const getShareUrl = async (data: BoardSnapshot): Promise<string> =>
{
  const fragment = await encodeBoardToShareFragment(data)
  return `${getWorkspaceBaseUrl()}#share=${fragment}`
}

// rough byte estimate of the encoded share URL
export const estimateShareSize = (data: BoardSnapshot): number =>
{
  const stripped = stripImagesForShare(data)
  const json = JSON.stringify(stripped)
  // compression ratio is ~40-60% for JSON; base64url adds ~33% overhead
  return Math.round(json.length * 0.5 * 1.33)
}

// check if the current URL has a share fragment
export const getShareFragment = (): string | null =>
{
  const hash = window.location.hash
  if (hash.startsWith('#share='))
  {
    return hash.slice(7)
  }
  return null
}

// clear the share fragment from the URL w/o triggering navigation
export const clearShareFragment = (): void =>
{
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  )
}
