// src/features/platform/media/imageUploader.ts
// upload local image variant blobs to Convex storage & record the mapping

import type {
  BoardSnapshot,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  collectSnapshotLocalImageHashes,
  forEachSnapshotItem,
} from '~/shared/lib/boardSnapshotItems'
import { getBlobsBatch, type BlobRecord } from '~/shared/images/imageBlobStore'
import {
  getUploadStatusBatch,
  markUploaded,
} from '~/shared/images/imageUploadIndex'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { brandedStringArrayIncludes, isPresent } from '~/shared/lib/typeGuards'
import {
  SUPPORTED_IMAGE_MIME_TYPES,
  type MediaVariantKind,
} from '@tierlistbuilder/contracts/platform/media'
import { getPrimaryImageRef } from '~/shared/lib/imageRefs'
import {
  getReusableMediaExternalIdsImperative,
  uploadEnvelopedVariants,
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

interface UploadBoardImagesOptions
{
  boardExternalId?: string | null
}

interface MediaUploadGroup
{
  uploadKey: string
  previewHash: string | null
  tileHash: string
  sourceHash: string | null
  itemIds: string[]
}

const makeMediaUploadKey = (
  previewHash: string | null,
  tileHash: string,
  sourceHash: string | null
): string => `media:${previewHash ?? ''}:${tileHash}:${sourceHash ?? ''}`

const groupVariantHashes = (group: MediaUploadGroup): string[] =>
  [group.previewHash, group.tileHash, group.sourceHash].filter(isPresent)

const isReusableCloudMediaRef = (
  ref: TierItemImageRef | undefined
): ref is TierItemImageRef & { cloudMediaExternalId: string } =>
  !!ref?.cloudMediaExternalId && ref.cloudMediaOwnership !== 'source'

const seedExistingCloudMediaIds = (
  snapshot: BoardSnapshot,
  result: BoardImageUploadResult,
  reusableExternalIds: ReadonlySet<string>
): void =>
{
  forEachSnapshotItem(snapshot, (item) =>
  {
    const primaryRef = getPrimaryImageRef(item, 'board')
    if (
      isReusableCloudMediaRef(primaryRef) &&
      reusableExternalIds.has(primaryRef.cloudMediaExternalId)
    )
    {
      result.mediaExternalIdByItemId.set(
        item.id,
        primaryRef.cloudMediaExternalId
      )
    }
    for (const ref of [item.imageRef, item.tileImageRef, item.sourceImageRef])
    {
      if (
        isReusableCloudMediaRef(ref) &&
        reusableExternalIds.has(ref.cloudMediaExternalId)
      )
      {
        result.mediaExternalIdByHash.set(ref.hash, ref.cloudMediaExternalId)
      }
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
    const previewHash = item.imageRef?.hash ?? null
    const tileHash = getPrimaryImageRef(item, 'board')?.hash
    if (!tileHash) return
    const sourceHash = item.sourceImageRef?.hash ?? null
    const groupKey = makeMediaUploadKey(previewHash, tileHash, sourceHash)
    const existing = groups.get(groupKey)
    if (existing)
    {
      existing.itemIds.push(item.id)
      return
    }
    groups.set(groupKey, {
      uploadKey: groupKey,
      previewHash,
      tileHash,
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
  const lookupRecord = (hash: string): BlobRecord =>
  {
    const record = storedBlobRecords.get(hash)
    if (!record)
    {
      throw new PermanentSyncError(
        'missing-local-image-blobs',
        `missing local blob for ${hash}`
      )
    }
    return record
  }

  const variantInputs: VariantUploadInput[] = [
    {
      kind: 'tile',
      hash: group.tileHash,
      record: lookupRecord(group.tileHash),
    },
  ]
  if (group.previewHash)
  {
    variantInputs.push({
      kind: 'preview',
      hash: group.previewHash,
      record: lookupRecord(group.previewHash),
    })
  }
  if (group.sourceHash)
  {
    variantInputs.push({
      kind: 'editor',
      hash: group.sourceHash,
      record: lookupRecord(group.sourceHash),
    })
  }

  for (const input of variantInputs)
  {
    assertSupportedMimeType(input.record.mimeType)
  }

  const { externalId } = await uploadEnvelopedVariants(
    variantInputs.map((input) => ({
      kind: input.kind,
      blob: new Blob([input.record.bytes as BlobPart]),
    }))
  )
  await markUploaded(uploadIndexUserId, group.uploadKey, externalId)
  return { hashes: groupVariantHashes(group), externalId }
}

// returns externalId only when *every* known variant hash maps to the same
// id — partial agreement forces a re-upload to keep the variant set coherent
const getKnownGroupExternalId = (
  group: MediaUploadGroup,
  result: BoardImageUploadResult,
  externalIdByUploadKey: ReadonlyMap<string, string | null>,
  reusableExternalIds: ReadonlySet<string>
): string | undefined =>
{
  const exact = externalIdByUploadKey.get(group.uploadKey)
  if (exact && reusableExternalIds.has(exact)) return exact

  const externalIds = groupVariantHashes(group).map((hash) =>
    result.mediaExternalIdByHash.get(hash)
  )
  const first = externalIds[0]
  if (!first || externalIds.some((externalId) => externalId !== first))
  {
    return undefined
  }
  return first
}

const collectCandidateReusableMediaExternalIds = (
  snapshot: BoardSnapshot,
  externalIdByUploadKey: ReadonlyMap<string, string | null>
): string[] =>
{
  const externalIds = new Set<string>()

  for (const externalId of externalIdByUploadKey.values())
  {
    if (externalId) externalIds.add(externalId)
  }

  forEachSnapshotItem(snapshot, (item) =>
  {
    for (const ref of [item.imageRef, item.tileImageRef, item.sourceImageRef])
    {
      if (isReusableCloudMediaRef(ref))
      {
        externalIds.add(ref.cloudMediaExternalId)
      }
    }
  })

  return [...externalIds]
}

const resolveReusableMediaExternalIds = async (
  snapshot: BoardSnapshot,
  boardExternalId: string | null,
  externalIdByUploadKey: ReadonlyMap<string, string | null>
): Promise<Set<string>> =>
{
  const externalIds = collectCandidateReusableMediaExternalIds(
    snapshot,
    externalIdByUploadKey
  )
  if (externalIds.length === 0)
  {
    return new Set()
  }

  const reusable = await getReusableMediaExternalIdsImperative({
    externalIds,
    boardExternalId,
  })

  return new Set(
    externalIds.filter((_externalId, index) => reusable[index] === true)
  )
}

type UploadAttemptResult =
  | { kind: 'uploaded'; hashes: string[]; externalId: string }
  | { kind: 'failed'; reason: unknown }

export const uploadBoardImages = async (
  snapshot: BoardSnapshot,
  userId: string,
  options: UploadBoardImagesOptions = {}
): Promise<BoardImageUploadResult> =>
{
  const hashes = collectSnapshotLocalImageHashes(snapshot)

  const result: BoardImageUploadResult = {
    mediaExternalIdByHash: new Map<string, string>(),
    mediaExternalIdByItemId: new Map<string, string>(),
  }

  if (hashes.length === 0)
  {
    return result
  }

  const groups = collectMediaUploadGroups(snapshot)
  const existingMap = await getUploadStatusBatch(
    userId,
    groups.map((group) => group.uploadKey)
  )
  const reusableExternalIds = await resolveReusableMediaExternalIds(
    snapshot,
    options.boardExternalId ?? null,
    existingMap
  )
  seedExistingCloudMediaIds(snapshot, result, reusableExternalIds)

  // walk groups once: propagate already-known externalIds for exact variant
  // sets, then collect the groups that still need uploading
  const uploadGroups: MediaUploadGroup[] = []
  for (const group of groups)
  {
    const externalId = getKnownGroupExternalId(
      group,
      result,
      existingMap,
      reusableExternalIds
    )
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

  const groupHashes = [...new Set(uploadGroups.flatMap(groupVariantHashes))]
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
