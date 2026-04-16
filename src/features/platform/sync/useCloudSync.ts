// src/features/platform/sync/useCloudSync.ts
// top-level cloud sync subscriber — gated on signed-in status,
// debounces board changes to Convex mutations

import { useEffect, useRef } from 'react'
import type { Doc } from '@convex/_generated/dataModel'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import {
  extractBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import {
  upsertBoardStateImperative,
  listMyBoardsImperative,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import { snapshotToCloudPayload } from '~/features/workspace/boards/data/cloud/boardMapper'
import { uploadBoardImages } from '~/features/workspace/boards/data/cloud/imageUploader'
import { setupCloudImageFetcher } from './cloudImageFetcher'
import {
  decideFirstLoginMerge,
  markCloudPullCompleted,
  hasCompletedCloudPull,
} from './cloudMerge'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import {
  loadPersistedBoardState,
  persistBoardSyncState,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { toast } from '~/shared/notifications/useToastStore'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from './cloudSyncScheduler'
import { pluralizeWord } from '~/shared/lib/pluralize'

const SYNC_DEBOUNCE_MS = 2500
const FIRST_LOGIN_BOARD_CONCURRENCY = 3

// feature flag — leave cloud sync off by setting VITE_ENABLE_CLOUD_SYNC=false
// until the first-login pull path (pullCloudBoards below) actually downloads
// full board state & images. while the flag is off the sign-in flow still
// works (so users can create an account) but background push is disabled
const CLOUD_SYNC_ENABLED = import.meta.env.VITE_ENABLE_CLOUD_SYNC !== 'false'

const readBoardStateForCloudSync = (
  boardId: BoardId
): {
  snapshot: ReturnType<typeof extractBoardData>
  syncState: BoardSyncState
} =>
{
  if (useWorkspaceBoardRegistryStore.getState().activeBoardId === boardId)
  {
    const state = useActiveBoardStore.getState()

    return {
      snapshot: extractBoardData(state),
      syncState: extractBoardSyncState(state),
    }
  }

  return loadPersistedBoardState(boardId)
}

// flush a single board snapshot to the cloud. returns a tri-state result so
// the caller can persist state only on real success — a conflict response
// must NOT advance lastSyncedRevision, an error must bubble for retry
const flushBoardToCloud = async (
  snapshot: BoardSnapshot,
  boardExternalId: string,
  baseRevision: number | null,
  userId: string
): Promise<
  | { kind: 'synced'; revision: number }
  | { kind: 'conflict' }
  | { kind: 'error'; error: unknown }
> =>
{
  try
  {
    const uploadResult = await uploadBoardImages(snapshot, userId)
    const payload = snapshotToCloudPayload(snapshot, uploadResult)

    const result = await upsertBoardStateImperative({
      boardExternalId,
      baseRevision,
      title: payload.title,
      tiers: payload.tiers,
      items: payload.items,
      deletedItemIds: payload.deletedItemIds,
    })

    if (result.conflict)
    {
      return { kind: 'conflict' }
    }

    return { kind: 'synced', revision: result.newRevision }
  }
  catch (error)
  {
    return { kind: 'error', error }
  }
}

// push all local boards to the cloud (first-login, cloud-empty case)
const pushAllLocalBoards = async (
  userId: string
): Promise<{
  failedBoardIds: BoardId[]
}> =>
{
  const boards = [...useWorkspaceBoardRegistryStore.getState().boards]

  const results = await mapAsyncLimit(
    boards,
    FIRST_LOGIN_BOARD_CONCURRENCY,
    async (meta) =>
    {
      const { snapshot, syncState } = readBoardStateForCloudSync(meta.id)

      const boardExternalId = syncState.cloudBoardExternalId ?? meta.id
      const outcome = await flushBoardToCloud(
        snapshot,
        boardExternalId,
        syncState.lastSyncedRevision,
        userId
      )

      if (outcome.kind === 'synced')
      {
        persistBoardSyncState(meta.id, {
          lastSyncedRevision: outcome.revision,
          cloudBoardExternalId:
            syncState.cloudBoardExternalId ?? boardExternalId,
        })
        return { boardId: meta.id, synced: true }
      }

      if (outcome.kind === 'error')
      {
        console.warn(`Board sync failed for ${meta.id}:`, outcome.error)
      }
      // conflict & error both count as "not synced" here — a first-login
      // conflict is surfaced via the dedicated toast once at the end
      return { boardId: meta.id, synced: false }
    }
  )

  const failedBoardIds = results
    .filter((result) => !result.synced)
    .map((result) => result.boardId)

  if (failedBoardIds.length > 0)
  {
    toast(
      `${failedBoardIds.length} ${pluralizeWord(failedBoardIds.length, 'board')} failed to sync. They will be retried next sign-in.`,
      'error'
    )
  }

  return { failedBoardIds }
}

// pull cloud boards into local storage (first-login, local-is-default case)
// todo: PR 4 will download full board state & images from cloud
const pullCloudBoards = async (): Promise<void> =>
{
  const cloudBoards = await listMyBoardsImperative()
  if (cloudBoards.length === 0) return

  toast(
    `${cloudBoards.length} ${pluralizeWord(cloudBoards.length, 'board')} found in the cloud.`,
    'info'
  )
}

// run the first-login merge flow
const runFirstLoginMerge = async (user: Doc<'users'>): Promise<void> =>
{
  const userId = getUserStableId(user)
  if (hasCompletedCloudPull(userId)) return

  try
  {
    const cloudBoards = await listMyBoardsImperative()
    const localBoards = useWorkspaceBoardRegistryStore.getState().boards
    const decision = decideFirstLoginMerge(cloudBoards, localBoards, userId)

    switch (decision.action)
    {
      case 'push-local':
      {
        const result = await pushAllLocalBoards(userId)
        if (result.failedBoardIds.length === 0)
        {
          markCloudPullCompleted(userId)
        }
        break
      }
      case 'pull-cloud':
        // don't mark completed — actual pull is not implemented yet.
        // the next sign-in will re-enter this flow
        await pullCloudBoards()
        break
      case 'conflict':
        toast(
          'You have boards on both this device and the cloud. Merge support coming soon.',
          'info'
        )
        break
      case 'skip':
        break
    }

    // only mark completed for paths that actually finished their work
    if (decision.action === 'skip' || decision.action === 'conflict')
    {
      markCloudPullCompleted(userId)
    }
  }
  catch (error)
  {
    console.warn('First-login merge failed:', error)
  }
}

export const useCloudSync = (user: Doc<'users'> | null): void =>
{
  const userId = user ? getUserStableId(user) : null
  // bumped on every sign-in/out so inflight work can tell "auth changed
  // mid-flush" apart from "same user, later edit"
  const authEpochRef = useRef(0)
  const currentUserIdRef = useRef<string | null>(null)
  // avoid duplicate conflict toasts for the same board flip-flop. the
  // scheduler will call onConflict repeatedly as edits queue; one
  // notification per board while the conflict is unresolved is plenty
  const conflictNoticedBoardIdsRef = useRef(new Set<BoardId>())

  useEffect(() =>
  {
    if (!userId || !user || !CLOUD_SYNC_ENABLED)
    {
      currentUserIdRef.current = null
      return
    }

    authEpochRef.current++
    const authEpoch = authEpochRef.current
    currentUserIdRef.current = userId
    conflictNoticedBoardIdsRef.current.clear()

    const capturedUserId = userId
    let lastLoadedBoardId =
      useWorkspaceBoardRegistryStore.getState().activeBoardId

    const shouldProceed = (): boolean =>
      authEpochRef.current === authEpoch &&
      currentUserIdRef.current === capturedUserId

    const scheduler = createCloudSyncScheduler({
      debounceMs: SYNC_DEBOUNCE_MS,
      hasBoard: (boardId) =>
        useWorkspaceBoardRegistryStore
          .getState()
          .boards.some((board) => board.id === boardId),
      shouldProceed,
      flush: async (work): Promise<FlushResult> =>
      {
        if (!shouldProceed())
        {
          return {
            kind: 'error',
            error: new Error('auth changed mid-flush'),
          }
        }

        const boardExternalId =
          work.syncState.cloudBoardExternalId ?? work.boardId
        const outcome = await flushBoardToCloud(
          work.snapshot,
          boardExternalId,
          work.syncState.lastSyncedRevision,
          capturedUserId
        )

        if (outcome.kind === 'conflict')
        {
          return { kind: 'conflict' }
        }
        if (outcome.kind === 'error')
        {
          return { kind: 'error', error: outcome.error }
        }

        return {
          kind: 'synced',
          syncState: {
            lastSyncedRevision: outcome.revision,
            cloudBoardExternalId:
              work.syncState.cloudBoardExternalId ?? boardExternalId,
          },
        }
      },
      persist: persistBoardSyncState,
      onError: (boardId, error) =>
      {
        console.warn(`Board sync failed for ${boardId}:`, error)
      },
      onConflict: (boardId) =>
      {
        if (conflictNoticedBoardIdsRef.current.has(boardId)) return
        conflictNoticedBoardIdsRef.current.add(boardId)
        toast(
          'Board has conflicting edits from another device. Sign-in again or reopen to resolve.',
          'error'
        )
      },
    })

    // wire up the cloud image fetcher (idempotent)
    setupCloudImageFetcher()

    void runFirstLoginMerge(user).catch((error) =>
    {
      console.warn('First-login merge failed:', error)
    })

    // subscribe only to persisted data fields via a shallow selector
    const unsubscribe = useActiveBoardStore.subscribe(
      selectBoardDataFields,
      () =>
      {
        if (!shouldProceed()) return

        const boardId = useWorkspaceBoardRegistryStore.getState().activeBoardId
        if (!boardId)
        {
          return
        }

        // board loads/switches replace the active store wholesale. skip the
        // first change for a newly loaded board & only sync later user edits
        if (boardId !== lastLoadedBoardId)
        {
          lastLoadedBoardId = boardId
          // edits on a freshly switched board are legitimate — clear the
          // "already notified" latch so a follow-up conflict still surfaces
          conflictNoticedBoardIdsRef.current.delete(boardId)
          return
        }

        const state = useActiveBoardStore.getState()
        const work: PendingBoardSync = {
          boardId,
          snapshot: extractBoardData(state),
          boardDataSelection: selectBoardDataFields(state),
          syncState: extractBoardSyncState(state),
        }
        scheduler.queue(work)
      },
      { equalityFn: boardDataFieldsEqual }
    )

    return () =>
    {
      void scheduler.dispose()
      unsubscribe()
    }
  }, [userId, user])
}
