// src/shared/sharing/shortLinkCodec.ts
// short-link snapshot codec: inline live images, drop private/deleted items, enforce cap

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  MAX_INFLATED_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_COMPRESSED_BYTES,
} from '@tierlistbuilder/contracts/platform/shortLink'
import { snapshotToWire } from '~/shared/board-data/boardWireMapper'
import {
  stripDeletedItemsForShare,
  stripPrivateItemFieldsForShare,
} from '~/shared/sharing/hashShare'
import { compressSnapshotPayloadBytes } from '~/shared/sharing/snapshotCompression'

const MAX_SHORT_LINK_PREFLIGHT_BYTES = MAX_INFLATED_SNAPSHOT_BYTES / 2

export const assertShortLinkSnapshotSize = (size: number): void =>
{
  if (size <= MAX_SNAPSHOT_COMPRESSED_BYTES)
  {
    return
  }

  throw new Error(
    `share snapshot exceeds the ${MAX_SNAPSHOT_COMPRESSED_BYTES}-byte compressed cap`
  )
}

const assertShortLinkPreflightSize = (size: number): void =>
{
  if (size <= MAX_SHORT_LINK_PREFLIGHT_BYTES)
  {
    return
  }

  throw new Error(
    `share snapshot exceeds the ${MAX_SHORT_LINK_PREFLIGHT_BYTES}-byte preflight cap`
  )
}

export const compressShortLinkSnapshotBytes = async (
  data: BoardSnapshot
): Promise<Uint8Array> =>
{
  const stripped = stripDeletedItemsForShare(
    stripPrivateItemFieldsForShare(data)
  )
  const preflightBytes = new TextEncoder().encode(JSON.stringify(stripped))
  assertShortLinkPreflightSize(preflightBytes.byteLength)

  const wire = await snapshotToWire(stripped, {
    maxInlineImageBytes: MAX_SHORT_LINK_PREFLIGHT_BYTES,
  })
  const compressed = await compressSnapshotPayloadBytes(wire)
  assertShortLinkSnapshotSize(compressed.byteLength)
  return compressed
}
