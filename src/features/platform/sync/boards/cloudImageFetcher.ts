// src/features/platform/sync/boards/cloudImageFetcher.ts
// registers the Convex-backed cloud image fetcher into the shared image cache

import { convexClient } from '~/features/platform/backend/convexClient'
import { api } from '@convex/_generated/api'
import { putBlob } from '~/shared/images/imageStore'
import {
  registerCloudImageFetcher,
  cacheFreshBlob,
} from '~/shared/images/imageBlobCache'
import { createBlobRecord } from '~/shared/images/blobRecord'

// fetch a blob from Convex storage, write to IDB, & warm the in-memory cache
const fetchFromCloud = async (
  hash: string,
  cloudMediaExternalId: string
): Promise<void> =>
{
  try
  {
    const asset = await convexClient.query(
      api.platform.media.queries.getMediaAsset,
      { mediaExternalId: cloudMediaExternalId }
    )

    if (!asset?.url) return

    const response = await fetch(asset.url)
    if (!response.ok) return

    const blob = await response.blob()
    const record = createBlobRecord(hash, blob, asset.mimeType)

    await putBlob(record)
    cacheFreshBlob(hash, blob)
  }
  catch (error)
  {
    console.warn('Cloud image fetch failed for hash', hash, error)
  }
}

// call once at app boot (when signed in) to wire up cloud image resolution
export const setupCloudImageFetcher = (): void =>
{
  registerCloudImageFetcher(fetchFromCloud)
}
