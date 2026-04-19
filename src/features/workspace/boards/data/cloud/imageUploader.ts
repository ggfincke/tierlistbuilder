// src/features/workspace/boards/data/cloud/imageUploader.ts
// upload local image blobs to Convex storage & record the mapping

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { Id } from '@convex/_generated/dataModel'
import { collectSnapshotImageHashes } from '~/shared/lib/boardSnapshotItems'
import {
  getBlobsBatch,
  getUploadStatusBatch,
  markUploaded,
} from '~/shared/images/imageStore'
import { mapAsyncLimitSettled } from '~/shared/lib/asyncMapLimit'
import { getImageDimensions } from '~/shared/images/imageDimensions'
import type { PreparedBlobRecord } from '~/shared/images/imagePersistence'
import {
  generateUploadUrlImperative,
  finalizeUploadImperative,
  type SupportedImageMimeType,
} from './boardRepository'

// 3 keeps the uploader polite on slow connections; raise if we see latency stalls
const UPLOAD_CONCURRENCY = 3

const SUPPORTED_IMAGE_MIME_TYPES: readonly SupportedImageMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

// narrow a BlobRecord mimeType into the server-accepted MIME set, or reject
const asSupportedMimeType = (mimeType: string): SupportedImageMimeType =>
{
  if ((SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType))
  {
    return mimeType as SupportedImageMimeType
  }
  throw new Error(
    `unsupported image MIME type: ${mimeType}. server accepts ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}`
  )
}

export interface BoardImageUploadResult
{
  mediaExternalIdByHash: Map<string, string>
}

// upload one image blob to Convex storage & finalize it. throws on any
// failure so callers can aggregate & surface a single error
const uploadSingleImage = async (
  userId: string,
  prepared: PreparedBlobRecord
): Promise<string> =>
{
  // pre-validate MIME so we don't upload bytes that finalizeUpload will
  // reject, leaving orphaned storage blobs
  const mimeType = asSupportedMimeType(prepared.record.mimeType)

  const dimensionsPromise = getImageDimensions(prepared.blob)

  const uploadUrl = await generateUploadUrlImperative()

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: prepared.record.bytes,
  })

  if (!response.ok)
  {
    throw new Error(
      `image upload failed for hash ${prepared.record.hash}: HTTP ${response.status}`
    )
  }

  const { storageId } = (await response.json()) as {
    storageId: Id<'_storage'>
  }

  const { width, height } = await dimensionsPromise

  const { externalId } = await finalizeUploadImperative({
    storageId,
    contentHash: prepared.record.hash,
    mimeType,
    width,
    height,
    byteSize: prepared.record.byteSize,
  })

  await markUploaded(userId, prepared.record.hash, externalId)
  return externalId
}

// collect the first rejection reason from a settled batch so aggregated
// errors still include useful context in the message
const firstRejectionReason = (
  results: readonly PromiseSettledResult<unknown>[]
): unknown =>
  results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )?.reason

// upload all un-uploaded images for a board & return a hash->mediaExternalId
// map. all-or-nothing: throws if any upload or finalize step fails so the
// caller never persists a partially-synced state w/ dangling mediaExternalIds
export const uploadBoardImages = async (
  snapshot: BoardSnapshot,
  userId: string
): Promise<BoardImageUploadResult> =>
{
  const hashes = collectSnapshotImageHashes(snapshot)

  const result: BoardImageUploadResult = {
    mediaExternalIdByHash: new Map<string, string>(),
  }

  if (hashes.length === 0)
  {
    return result
  }

  const existingMap = await getUploadStatusBatch(userId, hashes)

  for (const [hash, externalId] of existingMap)
  {
    if (externalId)
    {
      result.mediaExternalIdByHash.set(hash, externalId)
    }
  }

  const needsBlobUpload = hashes.filter(
    (hash) => !result.mediaExternalIdByHash.has(hash)
  )
  const storedBlobRecords = await getBlobsBatch(needsBlobUpload)

  // reject up-front if a referenced blob is missing locally. without this
  // the item would sync w/ no mediaExternalId & load broken on every device
  const missingBlobHashes = needsBlobUpload.filter(
    (hash) => !storedBlobRecords.get(hash)
  )
  if (missingBlobHashes.length > 0)
  {
    throw new Error(
      `missing local blobs for ${missingBlobHashes.length} image hash(es): ` +
        missingBlobHashes.slice(0, 3).join(', ') +
        (missingBlobHashes.length > 3 ? '…' : '')
    )
  }

  const uploadResults = await mapAsyncLimitSettled(
    needsBlobUpload,
    UPLOAD_CONCURRENCY,
    async (hash) =>
    {
      const record = storedBlobRecords.get(hash)!
      const externalId = await uploadSingleImage(userId, {
        imageRef: { hash },
        blob: record.bytes,
        record,
      })
      return { hash, externalId }
    }
  )

  const failures = uploadResults.filter((r) => r.status === 'rejected')
  if (failures.length > 0)
  {
    throw new Error(
      `failed to upload ${failures.length} of ${needsBlobUpload.length} image blobs: ` +
        String(firstRejectionReason(uploadResults))
    )
  }

  for (const entry of uploadResults)
  {
    if (entry.status === 'fulfilled')
    {
      result.mediaExternalIdByHash.set(entry.value.hash, entry.value.externalId)
    }
  }

  return result
}
