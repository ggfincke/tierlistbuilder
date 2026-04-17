// src/features/workspace/boards/data/cloud/boardRepository.ts
// Convex query/mutation adapters for cloud board sync.
// hook-based wrappers are for React components; *Imperative variants are
// for non-React sync logic (useCloudSync, first-login merge)

import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type {
  BoardListItem,
  DeletedBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardPayload,
  CloudBoardState,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { convexClient } from '~/features/platform/backend/convexClient'

export const useListMyBoards = (
  enabled: boolean
): BoardListItem[] | undefined =>
  useQuery(api.workspace.boards.queries.getMyBoards, enabled ? {} : 'skip')

export const useCreateBoard = () =>
  useMutation(api.workspace.boards.mutations.createBoard)

export const useDeleteBoard = () =>
  useMutation(api.workspace.boards.mutations.deleteBoard)

export const useUpdateBoardMeta = () =>
  useMutation(api.workspace.boards.mutations.updateBoardMeta)

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

export const createBoardImperative = (args: { title: string }) =>
  convexClient.mutation(api.workspace.boards.mutations.createBoard, args)

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

export const updateBoardMetaImperative = (args: {
  boardExternalId: string
  title?: string
}) =>
  convexClient.mutation(api.workspace.boards.mutations.updateBoardMeta, args)

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

export const generateUploadUrlImperative = () =>
  convexClient.mutation(api.platform.media.uploads.generateUploadUrl, {})

// narrow MIME types accepted by the server-side finalizeUpload validator.
// keep in sync w/ convex/platform/media/uploads.ts
export type SupportedImageMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'

export const finalizeUploadImperative = (args: {
  storageId: Id<'_storage'>
  contentHash: string
  mimeType: SupportedImageMimeType
  width: number
  height: number
  byteSize: number
}) => convexClient.mutation(api.platform.media.uploads.finalizeUpload, args)

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
