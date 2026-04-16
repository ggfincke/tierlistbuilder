// src/features/workspace/sharing/lib/hashShare.ts
// shareable link encoding & decoding — compress board data into a URL hash fragment

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { EMBED_ROUTE_PATH, normalizeBasePath } from '@/app/routes/pathname'
import { parseBoardSnapshotJson } from '@/features/workspace/export/lib/exportJson'
import { base64ToBytes, bytesToBase64 } from '@/shared/lib/binaryCodec'
import { mapSnapshotItems } from '@/shared/lib/boardSnapshotItems'

const buildAppUrl = (pathname = ''): string =>
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

// encode board data into a compressed base64url string
export const encodeBoardToShareFragment = async (
  data: BoardSnapshot
): Promise<string> =>
{
  const stripped = stripImagesForShare(data)
  const json = JSON.stringify(stripped)
  const encoder = new TextEncoder()
  const bytes = encoder.encode(json)

  // lazy-load pako for compression
  const { deflate } = await import('pako')
  const compressed = deflate(bytes)

  return toBase64Url(compressed)
}

// decode a compressed base64url string back to board data
export const decodeBoardFromShareFragment = async (
  fragment: string
): Promise<BoardSnapshot> =>
{
  const compressed = fromBase64Url(fragment)

  // lazy-load pako for decompression
  const { inflate } = await import('pako')
  const bytes = inflate(compressed)
  const decoder = new TextDecoder()
  const json = decoder.decode(bytes)

  return parseBoardSnapshotJson(json, 'Shared Tier List')
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
