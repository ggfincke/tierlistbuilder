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
  const compressed = base64UrlToBytes(fragment)
  if (compressed.length > MAX_SNAPSHOT_COMPRESSED_BYTES)
  {
    throw new Error(
      `share fragment exceeds the ${MAX_SNAPSHOT_COMPRESSED_BYTES}-byte compressed cap`
    )
  }
  return inflateSnapshotBytes(compressed)
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
