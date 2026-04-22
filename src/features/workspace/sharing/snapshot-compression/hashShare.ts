// src/features/workspace/sharing/snapshot-compression/hashShare.ts
// snapshot compression helpers shared by short-link encode/decode

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { MAX_INFLATED_SNAPSHOT_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { normalizeBasePath } from '~/app/routes/pathname'
import { parseBoardSnapshotJson } from '~/features/workspace/export/lib/exportJson'
import { mapSnapshotItems } from '~/shared/lib/boardSnapshotItems'

// build an absolute URL for the app, appending the configured base path.
// shared w/ the short-link URL builders
export const buildAppUrl = (pathname = ''): string =>
  `${window.location.origin}${normalizeBasePath()}${pathname}`

// drop image refs & deleted items from share payloads — inline bytes are
// re-attached by the share encoder from the blob store, not the snapshot
export const stripImagesForShare = (data: BoardSnapshot): BoardSnapshot =>
{
  return {
    ...mapSnapshotItems(data, (item) =>
    {
      const { imageRef: _imageRef, ...rest } = item
      return rest
    }),
    deletedItems: [],
  }
}

// strip -> JSON -> encode -> deflate. raw bytes suitable for binary transport
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
