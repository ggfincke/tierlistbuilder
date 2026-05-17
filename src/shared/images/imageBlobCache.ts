// src/shared/images/imageBlobCache.ts
// in-memory object URL cache keyed by content hash

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import { collectSnapshotRenderImageVariantRefs } from '~/shared/lib/boardSnapshotItems'
import { logger } from '~/shared/lib/logger'
import { pruneOldestMapEntries } from '~/shared/lib/lru'
import { getBlobsBatch } from './imageStore'

// pluggable cloud image batch fetcher — features register it at boot so shared
// code stays feature-agnostic. batching keeps one sign-in warm-up to one
// Convex round trip instead of N per-hash queries
export interface CloudImageRequest
{
  hash: string
  cloudMediaExternalId: string
  variant: MediaVariantKind
}

type CloudImageBatchFetcher = (
  requests: ReadonlyArray<CloudImageRequest>
) => Promise<void>

let cloudBatchFetcher: CloudImageBatchFetcher | null = null
// keyed by hash across all phases: pending (queued for next microtask flush),
// in flight (batch query + URL fetch chain still resolving). prevents a second
// useImageUrl effect on the same hash from re-enqueueing or racing the first
const inFlightByHash = new Map<string, Promise<void>>()
// next-flush buffer — keyed by hash so repeated requestCloudImage calls for
// the same image collapse to a single entry before the microtask fires
const pendingRequests = new Map<string, CloudImageRequest>()
// requests whose last fetch attempt failed (batch query or blob download).
// drained on `online` events so a momentary outage or auth blip doesn't leave
// hashes blank for the rest of the session
const failedCloudRequests = new Map<string, CloudImageRequest>()
let flushScheduled = false

// Convex query is capped at MAX_BATCH_LOOKUP_SIZE (50) server-side; match the
// chunk size on the client so oversize warm-ups split into multiple calls
const MAX_BATCH_SIZE = 50
const MAX_FAILED_CLOUD_REQUESTS = 512

export const registerCloudImageFetcher = (fn: CloudImageBatchFetcher): void =>
{
  if (cloudBatchFetcher && cloudBatchFetcher !== fn)
  {
    logger.warn(
      'media',
      'Cloud image fetcher already registered; keeping the first one.'
    )
    return
  }

  cloudBatchFetcher = fn

  // drain any requests that were queued before the fetcher was registered.
  // ItemContent effects fire on first render & race the useCloudSync effect
  // that wires this up, so the queue is non-empty in the common case
  if (pendingRequests.size > 0 && !flushScheduled)
  {
    flushScheduled = true
    queueMicrotask(flushPendingCloudRequests)
  }
}

const runBatch = (requests: ReadonlyArray<CloudImageRequest>): void =>
{
  if (!cloudBatchFetcher || requests.length === 0) return

  // split oversize batches so each Convex call fits the per-query cap
  for (let start = 0; start < requests.length; start += MAX_BATCH_SIZE)
  {
    const chunk = requests.slice(start, start + MAX_BATCH_SIZE)
    const promise = cloudBatchFetcher(chunk).finally(() =>
    {
      for (const { hash } of chunk)
      {
        if (inFlightByHash.get(hash) === promise)
        {
          inFlightByHash.delete(hash)
        }
      }
    })

    for (const { hash } of chunk)
    {
      inFlightByHash.set(hash, promise)
    }
  }
}

const flushPendingCloudRequests = (): void =>
{
  flushScheduled = false
  if (pendingRequests.size === 0) return

  const batch = [...pendingRequests.values()]
  pendingRequests.clear()
  runBatch(batch)
}

// queue a cloud fetch for a missing image. coalesces repeated calls for the
// same hash & dedups against in-flight fetches. pre-registration calls stay
// in `pendingRequests` until `registerCloudImageFetcher` drains them
export const requestCloudImage = (
  hash: string,
  cloudMediaExternalId: string,
  variant: MediaVariantKind = 'tile'
): void =>
{
  if (inFlightByHash.has(hash)) return
  if (pendingRequests.has(hash)) return

  pendingRequests.set(hash, { hash, cloudMediaExternalId, variant })
  failedCloudRequests.delete(hash)

  if (!cloudBatchFetcher) return

  if (!flushScheduled)
  {
    flushScheduled = true
    queueMicrotask(flushPendingCloudRequests)
  }
}

const ensureCloudImageCached = async (
  hash: string,
  cloudMediaExternalId: string,
  variant: MediaVariantKind = 'tile'
): Promise<void> =>
{
  if (cache.has(hash)) return
  requestCloudImage(hash, cloudMediaExternalId, variant)
  // wait for requestCloudImage's queued microtask to install inFlightByHash
  await Promise.resolve()
  await inFlightByHash.get(hash)
}

// mark batch/query failures for retry on the next reconnect. the caller runs
// while the batch's in-flight marker is still set, so only guard against
// already-cached & already-pending hashes here
export const markCloudRequestsFailed = (
  requests: ReadonlyArray<CloudImageRequest>
): void =>
{
  for (const request of requests)
  {
    if (cache.has(request.hash)) continue
    if (pendingRequests.has(request.hash)) continue
    failedCloudRequests.set(request.hash, request)
  }

  pruneOldestMapEntries(failedCloudRequests, MAX_FAILED_CLOUD_REQUESTS)
}

// requeue previously-failed cloud requests. fired on `online` events so
// transient outages self-heal; also invoked directly by callers that know
// recovery is likely (e.g. sign-in completion)
const retryFailedCloudRequests = (): void =>
{
  if (failedCloudRequests.size === 0) return

  let queued = 0
  for (const [hash, request] of failedCloudRequests)
  {
    if (cache.has(hash)) continue
    if (inFlightByHash.has(hash)) continue
    if (pendingRequests.has(hash)) continue
    pendingRequests.set(hash, request)
    queued++
  }
  failedCloudRequests.clear()

  if (queued > 0 && !flushScheduled)
  {
    flushScheduled = true
    queueMicrotask(flushPendingCloudRequests)
  }
}

interface CachedImageEntry
{
  url: string
  lastAccessedAt: number
}

const MAX_CACHED_IMAGE_URLS = 512

const cache = new Map<string, CachedImageEntry>()
const listeners = new Map<string, Set<() => void>>()

const publish = (hashes: Iterable<string>): void =>
{
  for (const hash of new Set(hashes))
  {
    const subscribers = listeners.get(hash)
    if (!subscribers)
    {
      continue
    }

    for (const listener of subscribers)
    {
      listener()
    }
  }
}

const touchCachedHashes = (hashes: Iterable<string>): void =>
{
  const now = Date.now()

  for (const hash of hashes)
  {
    const entry = cache.get(hash)
    if (entry)
    {
      entry.lastAccessedAt = now
      cache.delete(hash)
      cache.set(hash, entry)
    }
  }
}

// LRU eviction follows Map insertion order; touch moves entries to the back.
// mounted subscribers are protected because local-only images cannot rehydrate
const pruneCache = (protectedHashes: ReadonlySet<string>): void =>
{
  if (cache.size <= MAX_CACHED_IMAGE_URLS)
  {
    return
  }

  const changed: string[] = []

  pruneOldestMapEntries(
    cache,
    MAX_CACHED_IMAGE_URLS,
    (hash) => protectedHashes.has(hash) || listeners.has(hash),
    (hash, entry) =>
    {
      URL.revokeObjectURL(entry.url)
      changed.push(hash)
    }
  )

  if (changed.length > 0)
  {
    publish(changed)
  }
}

export const subscribeCachedImageUrl = (
  hash: string | undefined,
  listener: () => void
): (() => void) =>
{
  if (!hash)
  {
    return () =>
    {}
  }

  // touch on subscribe so a freshly-mounted consumer renews LRU recency for
  // its hash; w/o this, mount-then-evict cycles repeatedly target long-lived
  // images
  touchCachedHashes([hash])

  let subscribers = listeners.get(hash)
  if (!subscribers)
  {
    subscribers = new Set()
    listeners.set(hash, subscribers)
  }

  subscribers.add(listener)

  return () =>
  {
    const current = listeners.get(hash)
    if (!current)
    {
      return
    }

    current.delete(listener)
    if (current.size === 0)
    {
      listeners.delete(hash)
    }
  }
}

export const getCachedImageUrl = (hash: string | undefined): string | null =>
{
  if (!hash)
  {
    return null
  }

  return cache.get(hash)?.url ?? null
}

export const cacheFreshBlobs = (
  blobs: Iterable<readonly [string, Blob]>
): void =>
{
  const changed = new Set<string>()
  const now = Date.now()

  for (const [hash, blob] of blobs)
  {
    const existing = cache.get(hash)
    if (existing)
    {
      existing.lastAccessedAt = now
      cache.delete(hash)
      cache.set(hash, existing)
      continue
    }

    cache.set(hash, {
      url: URL.createObjectURL(blob),
      lastAccessedAt: now,
    })
    changed.add(hash)
  }

  if (changed.size > 0)
  {
    publish(changed)
  }

  pruneCache(changed)
}

export const cacheFreshBlob = (hash: string, blob: Blob): void =>
{
  cacheFreshBlobs([[hash, blob]])
}

// revoke every cached object URL & clear subscribers
export const disposeImageBlobCache = (): void =>
{
  for (const [, entry] of cache)
  {
    URL.revokeObjectURL(entry.url)
  }
  cache.clear()
  listeners.clear()
}

export const handlePageHide = (
  event: Pick<PageTransitionEvent, 'persisted'>
): void =>
{
  if (event.persisted)
  {
    return
  }

  disposeImageBlobCache()
}

// wire the pagehide teardown & online-driven retry once at module init.
// ignore persisted pagehide events so mounted subscribers survive a
// history restore. `online` retries previously-failed cloud fetches
if (typeof window !== 'undefined')
{
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('online', retryFailedCloudRequests)

  import.meta.hot?.dispose(() =>
  {
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('online', retryFailedCloudRequests)
    disposeImageBlobCache()
  })
}

export const warmImageHashes = async (
  hashes: Iterable<string | null | undefined>,
  signal?: AbortSignal
): Promise<void> =>
{
  const referenced = new Set<string>()
  for (const hash of hashes)
  {
    if (hash) referenced.add(hash)
  }
  const missing: string[] = []

  touchCachedHashes(referenced)

  for (const hash of referenced)
  {
    if (!cache.has(hash))
    {
      missing.push(hash)
    }
  }

  if (missing.length === 0)
  {
    pruneCache(referenced)
    return
  }

  signal?.throwIfAborted()
  const records = await getBlobsBatch(missing, { signal })
  signal?.throwIfAborted()
  const changed = new Set<string>()
  const now = Date.now()

  for (const hash of missing)
  {
    const existing = cache.get(hash)
    if (existing)
    {
      existing.lastAccessedAt = now
      continue
    }

    const record = records.get(hash)
    if (!record?.bytes)
    {
      continue
    }

    cache.set(hash, {
      url: URL.createObjectURL(record.bytes),
      lastAccessedAt: now,
    })
    changed.add(hash)
  }

  if (changed.size > 0)
  {
    publish(changed)
  }

  pruneCache(referenced)
}

interface WarmFromBoardOptions
{
  includeCloud?: boolean
  signal?: AbortSignal
}

export const warmFromBoard = async (
  snapshot: BoardSnapshot,
  options: WarmFromBoardOptions = {}
): Promise<void> =>
{
  const refs = collectSnapshotRenderImageVariantRefs(snapshot)
  await warmImageHashes(
    refs.map(({ ref }) => ref.hash),
    options.signal
  )

  if (!options.includeCloud)
  {
    return
  }

  options.signal?.throwIfAborted()
  // ensureCloudImageCached is idempotent on already-cached hashes, so just
  // hand it every cloud-backed ref & let it filter
  await Promise.all(
    refs.map(({ ref, variant }) =>
      ref.cloudMediaExternalId
        ? ensureCloudImageCached(ref.hash, ref.cloudMediaExternalId, variant)
        : null
    )
  )
}
