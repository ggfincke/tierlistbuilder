// src/features/platform/media/imageUploader.ts
// upload local image variant blobs to Convex storage & record the mapping

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  collectSnapshotLocalImageHashes,
  forEachSnapshotItem,
} from '~/shared/lib/boardSnapshotItems'
import {
  getBlobsBatch,
  getUploadStatusBatch,
  markUploaded,
  type BlobRecord,
} from '~/shared/images/imageStore'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { brandedStringArrayIncludes, isPresent } from '~/shared/lib/typeGuards'
import {
  SUPPORTED_IMAGE_MIME_TYPES,
  type MediaVariantKind,
} from '@tierlistbuilder/contracts/platform/media'
import {
  finalizeUploadVariantsImperative,
  generateUploadUrlsImperative,
  uploadEnvelopedBlob,
  type UploadedVariant,
} from '~/features/platform/media/uploadsRepository'
import { SYNC_CONCURRENCY } from '~/features/platform/sync/lib/concurrency'
import {
  isRateLimitedError,
  PermanentSyncError,
} from '~/features/platform/sync/lib/errors'

const assertSupportedMimeType = (mimeType: string): void =>
{
  if (brandedStringArrayIncludes(SUPPORTED_IMAGE_MIME_TYPES, mimeType))
  {
    return
  }
  throw new Error(
    `unsupported image MIME type: ${mimeType}. server accepts ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}`
  )
}

export interface BoardImageUploadResult
{
  mediaExternalIdByHash: Map<string, string>
  mediaExternalIdByItemId: Map<string, string>
}

interface MediaUploadGroup
{
  uploadKey: string
  displayHash: string
  sourceHash: string | null
  itemIds: string[]
}

const makeMediaUploadKey = (
  displayHash: string,
  sourceHash: string | null
): string => `media:${displayHash}:${sourceHash ?? ''}`

const seedExistingCloudMediaIds = (
  snapshot: BoardSnapshot,
  result: BoardImageUploadResult
): void =>
{
  forEachSnapshotItem(snapshot, (item) =>
  {
    const imageRef = item.imageRef
    const sourceImageRef = item.sourceImageRef
    const mediaExternalId =
      sourceImageRef?.cloudMediaExternalId ?? imageRef?.cloudMediaExternalId
    if (mediaExternalId)
    {
      result.mediaExternalIdByItemId.set(item.id, mediaExternalId)
    }
    if (imageRef?.cloudMediaExternalId)
    {
      result.mediaExternalIdByHash.set(
        imageRef.hash,
        imageRef.cloudMediaExternalId
      )
      if (sourceImageRef?.hash)
      {
        result.mediaExternalIdByHash.set(
          sourceImageRef.hash,
          sourceImageRef.cloudMediaExternalId ?? imageRef.cloudMediaExternalId
        )
      }
    }
    else if (sourceImageRef?.cloudMediaExternalId)
    {
      result.mediaExternalIdByHash.set(
        sourceImageRef.hash,
        sourceImageRef.cloudMediaExternalId
      )
    }
  })
}

const collectMediaUploadGroups = (
  snapshot: BoardSnapshot
): MediaUploadGroup[] =>
{
  const groups = new Map<string, MediaUploadGroup>()
  forEachSnapshotItem(snapshot, (item) =>
  {
    const displayHash = item.imageRef?.hash
    if (!displayHash) return
    const sourceHash = item.sourceImageRef?.hash ?? null
    const groupKey = makeMediaUploadKey(displayHash, sourceHash)
    const existing = groups.get(groupKey)
    if (existing)
    {
      existing.itemIds.push(item.id)
      return
    }
    groups.set(groupKey, {
      uploadKey: groupKey,
      displayHash,
      sourceHash,
      itemIds: [item.id],
    })
  })
  return [...groups.values()]
}

interface VariantUploadInput
{
  kind: MediaVariantKind
  hash: string
  record: BlobRecord
}

const uploadMediaGroup = async (
  uploadIndexUserId: string,
  group: MediaUploadGroup,
  storedBlobRecords: ReadonlyMap<string, BlobRecord>
): Promise<{ hashes: string[]; externalId: string }> =>
{
  const displayRecord = storedBlobRecords.get(group.displayHash)
  if (!displayRecord)
  {
    throw new PermanentSyncError(
      'missing-local-image-blobs',
      `missing local blob for ${group.displayHash}`
    )
  }

  const variantInputs: VariantUploadInput[] = [
    { kind: 'tile', hash: group.displayHash, record: displayRecord },
  ]
  if (group.sourceHash)
  {
    const sourceRecord = storedBlobRecords.get(group.sourceHash)
    if (!sourceRecord)
    {
      throw new PermanentSyncError(
        'missing-local-image-blobs',
        `missing local blob for ${group.sourceHash}`
      )
    }
    variantInputs.push({
      kind: 'editor',
      hash: group.sourceHash,
      record: sourceRecord,
    })
  }

  for (const input of variantInputs)
  {
    assertSupportedMimeType(input.record.mimeType)
  }

  // single rate-limit token per group covers all variant uploads
  const { envelopeUserId, urls } = await generateUploadUrlsImperative(
    variantInputs.length
  )

  const variants: UploadedVariant[] = await Promise.all(
    variantInputs.map(async (input, i) =>
    {
      const { uploadUrl, uploadToken } = urls[i]
      const storageId = await uploadEnvelopedBlob({
        uploadUrl,
        uploadToken,
        envelopeUserId,
        blob: new Blob([input.record.bytes as BlobPart]),
      })
      return { kind: input.kind, storageId, uploadToken }
    })
  )

  const { externalId } = await finalizeUploadVariantsImperative({ variants })
  const hashes = [group.displayHash, group.sourceHash].filter(isPresent)
  await markUploaded(uploadIndexUserId, group.uploadKey, externalId)
  return { hashes, externalId }
}

const getKnownGroupExternalId = (
  group: MediaUploadGroup,
  result: BoardImageUploadResult,
  externalIdByUploadKey: ReadonlyMap<string, string | null>
): string | undefined =>
  externalIdByUploadKey.get(group.uploadKey) ??
  result.mediaExternalIdByItemId.get(group.itemIds[0] ?? '') ??
  undefined

type UploadAttemptResult =
  | { kind: 'uploaded'; hashes: string[]; externalId: string }
  | { kind: 'failed'; reason: unknown }

export const uploadBoardImages = async (
  snapshot: BoardSnapshot,
  userId: string
): Promise<BoardImageUploadResult> =>
{
  const hashes = collectSnapshotLocalImageHashes(snapshot)

  const result: BoardImageUploadResult = {
    mediaExternalIdByHash: new Map<string, string>(),
    mediaExternalIdByItemId: new Map<string, string>(),
  }

  seedExistingCloudMediaIds(snapshot, result)

  if (hashes.length === 0)
  {
    return result
  }

  const groups = collectMediaUploadGroups(snapshot)
  const existingMap = await getUploadStatusBatch(
    userId,
    groups.map((group) => group.uploadKey)
  )

  // walk groups once: propagate already-known externalIds for exact variant
  // sets, then collect the groups that still need uploading
  const uploadGroups: MediaUploadGroup[] = []
  for (const group of groups)
  {
    const externalId = getKnownGroupExternalId(group, result, existingMap)
    if (externalId)
    {
      for (const itemId of group.itemIds)
      {
        result.mediaExternalIdByItemId.set(itemId, externalId)
      }
      continue
    }
    uploadGroups.push(group)
  }

  const groupHashes = [
    ...new Set(
      uploadGroups.flatMap((group) =>
        [group.displayHash, group.sourceHash].filter(isPresent)
      )
    ),
  ]
  const storedBlobRecords = await getBlobsBatch(groupHashes)

  const missingBlobHashes = groupHashes.filter(
    (hash) => !storedBlobRecords.get(hash)
  )
  if (missingBlobHashes.length > 0)
  {
    throw new PermanentSyncError(
      'missing-local-image-blobs',
      `missing local blobs for ${missingBlobHashes.length} image hash(es): ` +
        missingBlobHashes.slice(0, 3).join(', ') +
        (missingBlobHashes.length > 3 ? '...' : '')
    )
  }
  const presentBlobRecords = new Map<string, BlobRecord>()
  for (const [hash, record] of storedBlobRecords)
  {
    if (record)
    {
      presentBlobRecords.set(hash, record)
    }
  }

  const uploadResults = await mapAsyncLimit(
    uploadGroups,
    SYNC_CONCURRENCY.upload,
    async (group): Promise<UploadAttemptResult> =>
    {
      try
      {
        const uploaded = await uploadMediaGroup(
          userId,
          group,
          presentBlobRecords
        )
        for (const itemId of group.itemIds)
        {
          result.mediaExternalIdByItemId.set(itemId, uploaded.externalId)
        }
        return { kind: 'uploaded', ...uploaded }
      }
      catch (error)
      {
        if (isRateLimitedError(error))
        {
          throw error
        }
        return { kind: 'failed', reason: error }
      }
    }
  )
  const uploaded = uploadResults.filter(
    (entry): entry is Extract<UploadAttemptResult, { kind: 'uploaded' }> =>
      entry.kind === 'uploaded'
  )
  const failures = uploadResults.filter(
    (entry): entry is Extract<UploadAttemptResult, { kind: 'failed' }> =>
      entry.kind === 'failed'
  )

  if (failures.length > 0)
  {
    throw new Error(
      `failed to upload ${failures.length} of ${uploadGroups.length} image groups: ` +
        String(failures[0]?.reason)
    )
  }

  for (const entry of uploaded)
  {
    for (const hash of entry.hashes)
    {
      result.mediaExternalIdByHash.set(hash, entry.externalId)
    }
  }

  return result
}
