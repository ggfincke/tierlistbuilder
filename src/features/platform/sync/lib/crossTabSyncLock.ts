// src/features/platform/sync/lib/crossTabSyncLock.ts
// BroadcastChannel-based cross-tab coordination — lets a tab claim a short
// TTL lock so peer tabs skip flushes for recently-claimed boards

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { setMapEntryLru } from '~/shared/lib/lru'

// 10s TTL covers a typical flush round trip while keeping a crashed tab
// from blocking peers indefinitely
const PEER_LOCK_TTL_MS = 10_000
const CHANNEL_NAME = 'tlb-sync'
const MAX_PEER_LOCK_ENTRIES = 128

interface LockMessage
{
  type: 'lock'
  boardId: BoardId
  at: number
}

// most-recent `at` observed per peer board. (now - at < PEER_LOCK_TTL_MS) ->
// local scheduler skips flushing that board
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
      setMapEntryLru(
        lastAcquiredByPeer,
        data.boardId,
        data.at,
        MAX_PEER_LOCK_ENTRIES
      )
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
  const locked = Date.now() - at < PEER_LOCK_TTL_MS
  if (!locked) lastAcquiredByPeer.delete(boardId)
  return locked
}

// ms until the peer lock expires; 0 when unlocked. callers wait this out
// exactly once rather than polling through debounce cycles
export const getPeerLockRemainingMs = (boardId: BoardId): number =>
{
  const at = lastAcquiredByPeer.get(boardId)
  if (at === undefined) return 0
  const remaining = PEER_LOCK_TTL_MS - (Date.now() - at)
  if (remaining > 0) return remaining
  lastAcquiredByPeer.delete(boardId)
  return 0
}

// broadcast a fresh claim; idempotent — re-calling bumps the TTL window
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
    // BroadcastChannel is best-effort; failure degrades to pre-coordination
    // behavior — duplicate flushes are safe, just inefficient
  }
}
