// src/shared/images/imageBlobCache.ts
// in-memory object URL cache keyed by content hash

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { collectSnapshotImageHashes } from '~/shared/lib/boardSnapshotItems'
import { getBlobsBatch } from './imageStore'

// pluggable cloud image fetcher — features register an implementation at boot;
// shared code calls it w/o importing feature modules directly
type CloudImageFetcher = (
  hash: string,
  cloudMediaExternalId: string
) => Promise<void>

let cloudFetcher: CloudImageFetcher | null = null
const pendingCloudFetches = new Map<string, Promise<void>>()

export const registerCloudImageFetcher = (fn: CloudImageFetcher): void =>
{
  if (cloudFetcher && cloudFetcher !== fn)
  {
    console.warn(
      'Cloud image fetcher already registered; keeping the first one.'
    )
    return
  }

  cloudFetcher = fn
}

// trigger a cloud fetch for a missing image (deduped by hash)
export const requestCloudImage = (
  hash: string,
  cloudMediaExternalId: string
): void =>
{
  if (!cloudFetcher || pendingCloudFetches.has(hash)) return

  pendingCloudFetches.set(
    hash,
    cloudFetcher(hash, cloudMediaExternalId).finally(() =>
      pendingCloudFetches.delete(hash)
    )
  )
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
    }
  }
}

const pruneCache = (protectedHashes: ReadonlySet<string>): void =>
{
  if (cache.size <= MAX_CACHED_IMAGE_URLS)
  {
    return
  }

  const removable = [...cache.entries()]
    .filter(([hash]) => !protectedHashes.has(hash))
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)

  const changed: string[] = []

  while (cache.size > MAX_CACHED_IMAGE_URLS && removable.length > 0)
  {
    const [hash, entry] = removable.shift()!
    URL.revokeObjectURL(entry.url)
    cache.delete(hash)
    changed.push(hash)
  }

  if (changed.length > 0)
  {
    publish(changed)
  }
}

const protectedHashes = (keepHashes: Iterable<string>): Set<string> =>
{
  const protectedSet = new Set(keepHashes)

  for (const hash of listeners.keys())
  {
    protectedSet.add(hash)
  }

  return protectedSet
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

  pruneCache(protectedHashes(changed))
}

export const cacheFreshBlob = (hash: string, blob: Blob): void =>
{
  cacheFreshBlobs([[hash, blob]])
}

// revoke every cached object URL & clear subscribers. call on pagehide to
// release blob memory eagerly; the browser would otherwise hold the
// Blob-backed URLs alive until full GC or tab teardown
export const disposeImageBlobCache = (): void =>
{
  for (const [, entry] of cache)
  {
    URL.revokeObjectURL(entry.url)
  }
  cache.clear()
  listeners.clear()
}

// wire the pagehide teardown once at module init. pagehide fires reliably
// on tab close & bfcache navigation where beforeunload is skipped
if (typeof window !== 'undefined')
{
  window.addEventListener('pagehide', disposeImageBlobCache)
}

export const warmFromBoard = async (snapshot: BoardSnapshot): Promise<void> =>
{
  const referenced = new Set(collectSnapshotImageHashes(snapshot))
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
    pruneCache(protectedHashes(referenced))
    return
  }

  const records = await getBlobsBatch(missing)
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

  pruneCache(protectedHashes(referenced))
}
