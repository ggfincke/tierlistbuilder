// src/shared/sharing/hashShare.ts
// hash-fragment snapshot compression helpers

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { parseBoardSnapshotJson } from '~/shared/board-data/boardJson'
import { normalizeBasePath } from '~/shared/routes/pathname'
import { base64UrlToBytes, bytesToBase64Url } from '~/shared/lib/binaryCodec'
import { mapSnapshotItems } from '~/shared/lib/boardSnapshotItems'
import { hasAnyImageRef } from '~/shared/lib/imageRefs'
import {
  compressSnapshotPayloadBytes,
  inflateSnapshotJson,
} from '~/shared/sharing/snapshotCompression'

const STRIPPED_IMAGE_LABEL = 'Image'

type ShareFragmentDecodeErrorKind = 'empty' | 'too-large' | 'invalid'

export class ShareFragmentDecodeError extends Error
{
  readonly kind: ShareFragmentDecodeErrorKind

  constructor(
    kind: ShareFragmentDecodeErrorKind,
    message: string,
    options?: ErrorOptions
  )
  {
    super(message, options)
    this.kind = kind
    this.name = 'ShareFragmentDecodeError'
  }
}

export const isShareFragmentDecodeError = (
  error: unknown
): error is ShareFragmentDecodeError =>
  error instanceof ShareFragmentDecodeError

// build an absolute URL for the app, appending the configured base path
export const buildAppUrl = (pathname = ''): string =>
  `${window.location.origin}${normalizeBasePath()}${pathname}`

const hasRenderableTextField = (item: {
  label?: string
  backgroundColor?: string
}): boolean => !!item.label?.trim() || !!item.backgroundColor?.trim()

const getStrippedImageLabel = (item: { altText?: string }): string =>
  item.altText?.trim() || STRIPPED_IMAGE_LABEL

// drop image refs & deleted items from hash-fragment payloads
export const stripImagesForShare = (data: BoardSnapshot): BoardSnapshot =>
{
  return {
    ...mapSnapshotItems(data, (item) =>
    {
      const hadImage = hasAnyImageRef(item)
      const {
        imageRef: _imageRef,
        tileImageRef: _tileImageRef,
        sourceImageRef: _sourceImageRef,
        ...rest
      } = item
      if (hasRenderableTextField(rest)) return rest
      if (!hadImage) return rest
      return { ...rest, label: getStrippedImageLabel(item) }
    }),
    deletedItems: [],
  }
}

export const stripDeletedItemsForShare = <
  TSnapshot extends { deletedItems: unknown[] },
>(
  data: TSnapshot
): TSnapshot => ({
  ...data,
  deletedItems: [],
})

// hash fragments stay image-free so URLs remain bounded & portable
export const compressSnapshotBytes = async (
  data: BoardSnapshot
): Promise<Uint8Array> =>
  compressSnapshotPayloadBytes(stripImagesForShare(data))

export const inflateSnapshotBytes = async (
  compressed: Uint8Array,
  defaultTitle = 'Shared Tier List'
): Promise<BoardSnapshot> =>
{
  const json = await inflateSnapshotJson(compressed)
  return parseBoardSnapshotJson(json, defaultTitle)
}

export const encodeBoardToShareFragment = async (
  data: BoardSnapshot
): Promise<string> => bytesToBase64Url(await compressSnapshotBytes(data))

export const decodeBoardFromShareFragment = async (
  fragment: string
): Promise<BoardSnapshot> =>
{
  if (fragment.trim().length === 0)
  {
    throw new ShareFragmentDecodeError(
      'empty',
      'share fragment is missing a payload'
    )
  }

  let compressed: Uint8Array
  try
  {
    compressed = base64UrlToBytes(fragment)
  }
  catch (error)
  {
    throw new ShareFragmentDecodeError(
      'invalid',
      'share fragment is not valid base64url data',
      { cause: error }
    )
  }

  if (compressed.length === 0)
  {
    throw new ShareFragmentDecodeError(
      'empty',
      'share fragment decoded to an empty payload'
    )
  }

  if (compressed.length > MAX_SNAPSHOT_COMPRESSED_BYTES)
  {
    throw new ShareFragmentDecodeError(
      'too-large',
      `share fragment exceeds the ${MAX_SNAPSHOT_COMPRESSED_BYTES}-byte compressed cap`
    )
  }

  try
  {
    return await inflateSnapshotBytes(compressed)
  }
  catch (error)
  {
    throw new ShareFragmentDecodeError(
      'invalid',
      'share fragment payload is damaged or unsupported',
      { cause: error }
    )
  }
}

export const getShareFragment = (): string | null =>
{
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  return hash.startsWith('#share=') ? hash.slice(7) : null
}

export const clearShareFragment = (): void =>
{
  if (typeof window === 'undefined') return
  if (!window.location.hash.startsWith('#share=')) return
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  )
}
