// src/features/social/showcase/model/useShowcaseEditor.ts
// profile-showcase editor query, store-load, & save lifecycle

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  boardDataFieldsEqual,
  extractBoardData,
} from '~/shared/board-data/boardSnapshot'
import {
  boardSnapshotToShowcaseSave,
  editShowcaseToSnapshot,
  SHOWCASE_PALETTE_ID,
} from '~/features/social/showcase/model/showcaseSnapshot'
import {
  enterShowcaseEditing,
  exitShowcaseEditing,
} from '~/features/social/showcase/model/showcaseSession'
import {
  createShowcaseSaveScheduler,
  type ShowcaseSaveScheduler,
} from '~/features/social/showcase/model/showcaseSaveScheduler'

const SAVE_DEBOUNCE_MS = 500

type ShowcaseEditorBoard = ReturnType<typeof editShowcaseToSnapshot>

interface UseShowcaseEditorResult
{
  board: ShowcaseEditorBoard | null
  addTier: () => void
  flushPendingSave: () => void
}

export const useShowcaseEditor = (): UseShowcaseEditorResult =>
{
  const editData = useQuery(
    api.social.showcase.queries.getMyProfileShowcase,
    {}
  )
  const saveShowcase = useMutation(
    api.social.showcase.mutations.saveProfileShowcase
  )

  // recomputing tiles on reactive editData updates is cheap; the store loads
  // once below so in-progress edits are not clobbered
  const board = useMemo(
    () => (editData ? editShowcaseToSnapshot(editData) : null),
    [editData]
  )

  const loadedRef = useRef(false)
  const saveSchedulerRef = useRef<ShowcaseSaveScheduler | null>(null)

  const saveCurrentShowcase = useCallback(() =>
  {
    if (!loadedRef.current) return
    const snapshot = extractBoardData(useActiveBoardStore.getState())
    void saveShowcase(boardSnapshotToShowcaseSave(snapshot))
  }, [saveShowcase])

  useEffect(() =>
  {
    const scheduler = createShowcaseSaveScheduler(
      saveCurrentShowcase,
      SAVE_DEBOUNCE_MS
    )
    saveSchedulerRef.current = scheduler
    return () =>
    {
      scheduler.flush()
      scheduler.cancel()
      if (saveSchedulerRef.current === scheduler)
      {
        saveSchedulerRef.current = null
      }
    }
  }, [saveCurrentShowcase])

  useEffect(() =>
  {
    if (loadedRef.current || !board) return
    loadedRef.current = true
    enterShowcaseEditing(board.snapshot)
  }, [board])

  useEffect(
    () => () =>
    {
      exitShowcaseEditing()
      loadedRef.current = false
    },
    []
  )

  useEffect(() =>
  {
    const unsubscribe = useActiveBoardStore.subscribe(
      (state) => state,
      () =>
      {
        if (!loadedRef.current) return
        saveSchedulerRef.current?.schedule()
      },
      { equalityFn: boardDataFieldsEqual }
    )
    return unsubscribe
  }, [])

  const addTier = useCallback(
    () => useActiveBoardStore.getState().addTier(SHOWCASE_PALETTE_ID),
    []
  )

  const flushPendingSave = useCallback((): void =>
  {
    saveSchedulerRef.current?.flush()
  }, [])

  return { board, addTier, flushPendingSave }
}
