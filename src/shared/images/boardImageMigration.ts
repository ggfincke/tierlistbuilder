// src/shared/images/boardImageMigration.ts
// migrate inline board item data URLs into the shared image store

import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { mapSnapshotItemsAsync } from '@/shared/lib/boardSnapshotItems'
import { probeImageStore } from './imageStore'
import {
  prepareDataUrlRecord,
  persistPreparedBlobRecords,
  type PreparedBlobRecord,
} from './imagePersistence'

const stripInlineImageUrl = (item: TierItem): TierItem =>
{
  if (!item.imageUrl)
  {
    return item
  }

  const { imageUrl: _imageUrl, ...rest } = item
  return rest
}

// migrate every inline image on a snapshot into the IndexedDB store
export const migrateBoardImages = async (
  snapshot: BoardSnapshot
): Promise<BoardSnapshot> =>
{
  if (!(await probeImageStore()))
  {
    return snapshot
  }

  const prepared: PreparedBlobRecord[] = []

  const migrated = await mapSnapshotItemsAsync(snapshot, async (item) =>
  {
    if (item.imageRef)
    {
      return stripInlineImageUrl(item)
    }

    if (!item.imageUrl)
    {
      return item
    }

    try
    {
      const record = await prepareDataUrlRecord(item.imageUrl)
      prepared.push(record)

      const { imageUrl: _imageUrl, ...rest } = item
      return {
        ...rest,
        imageRef: record.imageRef,
      }
    }
    catch
    {
      return item
    }
  })

  if (migrated === snapshot)
  {
    return snapshot
  }

  if (prepared.length === 0)
  {
    return migrated
  }

  try
  {
    await persistPreparedBlobRecords(prepared)
    return migrated
  }
  catch
  {
    return snapshot
  }
}
