// src/features/workspace/sharing/short-link/shortLinkCodec.ts
// short-link snapshot codec: inline live images, drop deleted items, enforce cap

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { snapshotToWire } from '~/features/workspace/export/lib/boardWireMapper'
import {
  compressSnapshotPayloadBytes,
  stripDeletedItemsForShare,
} from '~/features/workspace/sharing/snapshot-compression/hashShare'

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

export const compressShortLinkSnapshotBytes = async (
  data: BoardSnapshot
): Promise<Uint8Array> =>
{
  const wire = await snapshotToWire(stripDeletedItemsForShare(data))
  const compressed = await compressSnapshotPayloadBytes(wire)
  assertShortLinkSnapshotSize(compressed.byteLength)
  return compressed
}
