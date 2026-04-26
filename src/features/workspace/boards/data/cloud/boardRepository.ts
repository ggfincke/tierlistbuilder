// src/features/workspace/boards/data/cloud/boardRepository.ts
// Convex query/mutation adapters for cloud board sync.
// hook-based wrappers for React components; *Imperative variants for non-React sync logic

import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { DeletedBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardPayload,
  CloudBoardState,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { convexClient } from '~/features/platform/sync/lib/convexClient'

// list the caller's soft-deleted boards. powers the "Recently deleted"
// surface; reactive so a successful restore / permanent-delete on another
// tab refreshes this view automatically
export const useListMyDeletedBoards = (
  enabled: boolean
): DeletedBoardListItem[] | undefined =>
  useQuery(
    api.workspace.boards.queries.getMyDeletedBoards,
    enabled ? {} : 'skip'
  )

export const deleteBoardImperative = (args: { boardExternalId: string }) =>
  convexClient.mutation(api.workspace.boards.mutations.deleteBoard, args)

export const restoreBoardImperative = (args: { boardExternalId: string }) =>
  convexClient.mutation(api.workspace.boards.mutations.restoreBoard, args)

export const permanentlyDeleteBoardImperative = (args: {
  boardExternalId: string
}) =>
  convexClient.mutation(
    api.workspace.boards.mutations.permanentlyDeleteBoard,
    args
  )

export const upsertBoardStateImperative = (
  args: CloudBoardPayload & {
    boardExternalId: string
    baseRevision: number | null
  }
) =>
  convexClient.mutation(
    api.workspace.boards.upsertBoardState.upsertBoardState,
    args
  )

export const generateUploadUrlImperative = (): Promise<{
  uploadUrl: string
  uploadToken: string
  envelopeUserId: string
}> => convexClient.mutation(api.platform.media.uploads.generateUploadUrl, {})

export const finalizeUploadImperative = (args: {
  storageId: Id<'_storage'>
  uploadToken: string
}) => convexClient.action(api.platform.media.uploads.finalizeUpload, args)

export const listMyBoardsImperative = () =>
  convexClient.query(api.workspace.boards.queries.getMyBoards, {})

export const getBoardStateByExternalIdImperative = (args: {
  boardExternalId: string
}): Promise<CloudBoardState | null> =>
  convexClient.query(
    api.workspace.boards.queries.getBoardStateByExternalId,
    args
  )

export const getBoardStatesByExternalIdsImperative = (args: {
  boardExternalIds: string[]
}): Promise<Array<CloudBoardState | null>> =>
  convexClient.query(
    api.workspace.boards.queries.getBoardStatesByExternalIds,
    args
  )
