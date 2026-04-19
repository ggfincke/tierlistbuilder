// src/features/platform/sync/boards/cloudImageFetcher.ts
// registers the Convex-backed cloud image batch fetcher into the shared image cache

import { convexClient } from '~/features/platform/convex/convexClient'
import { api } from '@convex/_generated/api'
import { putBlob } from '~/shared/images/imageStore'
import {
  cacheFreshBlob,
  markCloudRequestsFailed,
  registerCloudImageFetcher,
  type CloudImageRequest,
} from '~/shared/images/imageBlobCache'
import { createBlobRecord } from '~/shared/images/imagePersistence'

// max parallel URL fetches after the Convex query resolves — blob downloads
// go to the Convex storage CDN, not the app server, so throttling here only
// protects the browser's connection pool from 50 simultaneous requests
const BLOB_FETCH_CONCURRENCY = 8

interface ResolvedAsset
{
  request: CloudImageRequest
  url: string
  mimeType: string
}

// returns true on success so the drainer can stash failed requests for a
// later retry — transient signed-URL or CDN errors shouldn't leave the hash
// blank for the rest of the session
const fetchBlobAndCache = async (asset: ResolvedAsset): Promise<boolean> =>
{
  try
  {
    const response = await fetch(asset.url)
    if (!response.ok) return false

    const blob = await response.blob()
    const record = createBlobRecord(asset.request.hash, blob, asset.mimeType)

    await putBlob(record)
    cacheFreshBlob(asset.request.hash, blob)
    return true
  }
  catch (error)
  {
    console.warn('Cloud image fetch failed for hash', asset.request.hash, error)
    return false
  }
}

// bounded-concurrency drainer — pops from the queue until empty so we don't
// overrun the browser's HTTP/2 connection window w/ 50 simultaneous blobs.
// workers push each failed request into `failed` so the caller can requeue
const drainBlobFetches = async (
  queue: ResolvedAsset[],
  failed: CloudImageRequest[]
): Promise<void> =>
{
  const workers = Array.from(
    { length: Math.min(BLOB_FETCH_CONCURRENCY, queue.length) },
    async () =>
    {
      while (queue.length > 0)
      {
        const next = queue.shift()
        if (!next) return
        const ok = await fetchBlobAndCache(next)
        if (!ok) failed.push(next.request)
      }
    }
  )
  await Promise.all(workers)
}

// batch fetcher: issue one Convex lookup for all pending externalIds, then
// download/cache each resolved blob. missing rows drop silently; transient
// query/blob failures get stashed for the next online-event retry
const fetchBatchFromCloud = async (
  requests: ReadonlyArray<CloudImageRequest>
): Promise<void> =>
{
  if (requests.length === 0) return

  let lookups: Array<{
    externalId: string
    url: string
    mimeType: string
  } | null>

  try
  {
    lookups = await convexClient.query(
      api.platform.media.queries.getMediaAssetsByExternalIds,
      {
        mediaExternalIds: requests.map((r) => r.cloudMediaExternalId),
      }
    )
  }
  catch (error)
  {
    console.warn('Cloud image batch lookup failed', error)
    markCloudRequestsFailed(requests)
    return
  }

  const resolved: ResolvedAsset[] = []
  for (let i = 0; i < requests.length; i++)
  {
    const lookup = lookups[i]
    if (!lookup) continue
    resolved.push({
      request: requests[i],
      url: lookup.url,
      mimeType: lookup.mimeType,
    })
  }

  const failed: CloudImageRequest[] = []
  await drainBlobFetches(resolved, failed)
  if (failed.length > 0)
  {
    markCloudRequestsFailed(failed)
  }
}

// call once at app boot (when signed in) to wire up cloud image resolution
export const setupCloudImageFetcher = (): void =>
{
  registerCloudImageFetcher(fetchBatchFromCloud)
}
