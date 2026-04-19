// src/features/platform/sync/lib/crossTabSyncLock.ts
// BroadcastChannel-based cross-tab coordination — lets a tab claim a short
// TTL lock so peer tabs skip flushes for recently-claimed boards

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

// 10s TTL — long enough to cover a typical flush round trip, short enough
// that a crashed tab doesn't block its peers forever
const LOCK_TTL_MS = 10_000
const CHANNEL_NAME = 'tlb-sync'

interface LockMessage
{
  type: 'lock'
  boardId: BoardId
  // epoch millis when the lock was claimed (by the sending tab)
  at: number
}

// lastAcquiredByPeer[boardId] = most recent `at` timestamp we've observed
// from a peer tab. if now - at < LOCK_TTL_MS, the local scheduler should
// skip flushing that board
const lastAcquiredByPeer = new Map<BoardId, number>()

let channel: BroadcastChannel | null = null

const getChannel = (): BroadcastChannel | null =>
{
  if (channel) return channel
  if (typeof BroadcastChannel === 'undefined') return null
  try
  {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', (event) =>
    {
      const data = event.data as LockMessage | undefined
      if (!data || data.type !== 'lock') return
      lastAcquiredByPeer.set(data.boardId, data.at)
    })
    return channel
  }
  catch
  {
    return null
  }
}

// true iff another tab has claimed a flush for this board within the TTL
export const isBoardLockedByPeer = (boardId: BoardId): boolean =>
{
  const at = lastAcquiredByPeer.get(boardId)
  if (at === undefined) return false
  return Date.now() - at < LOCK_TTL_MS
}

// ms until the peer lock expires for this board; 0 when not locked.
// callers use this to wait out the lock exactly once instead of polling
// the debounce interval while a fast-edit peer keeps the lock alive
export const getPeerLockRemainingMs = (boardId: BoardId): number =>
{
  const at = lastAcquiredByPeer.get(boardId)
  if (at === undefined) return 0
  const remaining = LOCK_TTL_MS - (Date.now() - at)
  return remaining > 0 ? remaining : 0
}

// broadcast a fresh claim for the given board. idempotent — calling twice
// just bumps the TTL window for peers
export const announceBoardLock = (boardId: BoardId): void =>
{
  const ch = getChannel()
  if (!ch) return
  try
  {
    ch.postMessage({
      type: 'lock',
      boardId,
      at: Date.now(),
    } satisfies LockMessage)
  }
  catch
  {
    // swallow — BroadcastChannel is best-effort, a failure just degrades
    // back to the pre-coordination behavior (duplicate flushes are safe
    // but inefficient)
  }
}
