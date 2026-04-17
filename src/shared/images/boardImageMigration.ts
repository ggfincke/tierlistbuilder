// src/shared/images/boardImageMigration.ts
// migrate inline board item data URLs into the shared image store

import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  forEachSnapshotItem,
  mapSnapshotItems,
} from '~/shared/lib/boardSnapshotItems'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { probeImageStore } from './imageStore'
import {
  prepareDataUrlRecord,
  persistPreparedBlobRecords,
  type PreparedBlobRecord,
} from './imagePersistence'

const BLOB_PREPARE_CONCURRENCY = 3

// identity used to match items across the collect & replace passes. keyed on
// id for live items & on the deletedItems array index for tombstones (those
// share the same id as a live item on restore)
type ItemKey =
  | { scope: 'live'; id: ItemId }
  | { scope: 'deleted'; index: number }

interface InlineWork
{
  key: ItemKey
  dataUrl: string
}

// pure — identify every item that needs an inline image migration
const collectInlineImageItems = (snapshot: BoardSnapshot): InlineWork[] =>
{
  const work: InlineWork[] = []
  let deletedIndex = 0

  forEachSnapshotItem(snapshot, (item, id) =>
  {
    if (id === null)
    {
      if (item.imageUrl && !item.imageRef)
      {
        work.push({
          key: { scope: 'deleted', index: deletedIndex },
          dataUrl: item.imageUrl,
        })
      }
      deletedIndex++
      return
    }

    if (item.imageUrl && !item.imageRef)
    {
      work.push({
        key: { scope: 'live', id },
        dataUrl: item.imageUrl,
      })
    }
  })

  return work
}

// strip the inline imageUrl — items w/ both imageRef & imageUrl have already
// been migrated & just carry a legacy fallback field we no longer need
const stripInlineImageUrl = (item: TierItem): TierItem =>
{
  if (!item.imageUrl)
  {
    return item
  }
  const { imageUrl: _imageUrl, ...rest } = item
  return rest
}

// build a new snapshot from the persisted records without mutating the input
const replaceInlineWithRefs = (
  snapshot: BoardSnapshot,
  work: readonly InlineWork[],
  prepared: readonly PreparedBlobRecord[]
): BoardSnapshot =>
{
  const preparedByLiveId = new Map<ItemId, PreparedBlobRecord>()
  const preparedByDeletedIndex = new Map<number, PreparedBlobRecord>()

  for (let i = 0; i < work.length; i++)
  {
    const key = work[i].key
    if (key.scope === 'live')
    {
      preparedByLiveId.set(key.id, prepared[i])
    }
    else
    {
      preparedByDeletedIndex.set(key.index, prepared[i])
    }
  }

  let deletedIndex = 0
  return mapSnapshotItems(snapshot, (item, id) =>
  {
    if (id !== null)
    {
      const preparedRecord = preparedByLiveId.get(id)
      if (preparedRecord)
      {
        const { imageUrl: _imageUrl, ...rest } = item
        return { ...rest, imageRef: preparedRecord.imageRef }
      }
      return stripInlineImageUrl(item)
    }

    const currentIndex = deletedIndex++
    const preparedRecord = preparedByDeletedIndex.get(currentIndex)
    if (preparedRecord)
    {
      const { imageUrl: _imageUrl, ...rest } = item
      return { ...rest, imageRef: preparedRecord.imageRef }
    }
    return stripInlineImageUrl(item)
  })
}

// migrate every inline image on a snapshot into the IndexedDB store.
// persist-before-mutate: hash & persist all candidates first, then build
// a new snapshot from persisted records; returns the original on any error
export const migrateBoardImages = async (
  snapshot: BoardSnapshot
): Promise<BoardSnapshot> =>
{
  if (!(await probeImageStore()))
  {
    return snapshot
  }

  const work = collectInlineImageItems(snapshot)
  if (work.length === 0)
  {
    return snapshot
  }

  let prepared: PreparedBlobRecord[]
  try
  {
    prepared = await mapAsyncLimit(work, BLOB_PREPARE_CONCURRENCY, (entry) =>
      prepareDataUrlRecord(entry.dataUrl)
    )
  }
  catch (error)
  {
    console.warn('Inline image hashing failed; skipping migration.', error)
    return snapshot
  }

  try
  {
    await persistPreparedBlobRecords(prepared)
  }
  catch (error)
  {
    console.warn('Inline image persistence failed; skipping migration.', error)
    return snapshot
  }

  return replaceInlineWithRefs(snapshot, work, prepared)
}
