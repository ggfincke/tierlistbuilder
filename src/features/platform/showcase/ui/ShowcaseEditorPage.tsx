// src/features/platform/showcase/ui/ShowcaseEditorPage.tsx
// self-only tlotl editor — reuses the workspace dnd over a Convex-backed
// showcase. the global autosave is gated while this page owns the board store

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'

import { api } from '@convex/_generated/api'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import type { ShowcaseRankingTile } from '@tierlistbuilder/contracts/platform/showcase'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { SignedOutPrompt } from '~/shared/ui/PageState'
import { PAGE_TOP_LEVEL } from '~/shared/ui/pageContainer'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { BoardRenderOverridesProvider } from '~/features/workspace/boards/model/BoardRenderOverridesProvider'
import { TierList } from '~/features/workspace/boards/ui/tier-list/TierList'
import { ShowcasePool } from '~/features/platform/showcase/ui/ShowcasePool'
import { ShowcaseRenderContext } from '~/shared/board-ui/ShowcaseRenderContext'
import {
  boardDataFieldsEqual,
  extractBoardData,
} from '~/shared/board-data/boardSnapshot'
import {
  boardSnapshotToShowcaseSave,
  editShowcaseToSnapshot,
  SHOWCASE_PALETTE_ID,
} from '~/features/platform/showcase/model/showcaseSnapshot'
import {
  enterShowcaseEditing,
  exitShowcaseEditing,
} from '~/features/platform/showcase/model/showcaseSession'
import {
  createShowcaseSaveScheduler,
  type ShowcaseSaveScheduler,
} from '~/features/platform/showcase/model/showcaseSaveScheduler'

const SAVE_DEBOUNCE_MS = 500
const SHOWCASE_ITEM_SIZE: ItemSize = 'large'
// stable empty map for the render context while the showcase query loads
const EMPTY_TILES: Map<string, ShowcaseRankingTile> = new Map()

const ShowcaseToolbar = ({ onAddTier }: { onAddTier: () => void }) => (
  <div className="flex items-center">
    <button
      type="button"
      onClick={onAddTier}
      className="focus-custom inline-flex items-center gap-1.5 rounded-lg border border-[var(--t-border)] px-3 py-2 text-[13px] font-bold text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
    >
      <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      Add tier
    </button>
  </div>
)

const ShowcaseEditorSkeleton = () => (
  <div className={PAGE_TOP_LEVEL} aria-hidden="true">
    <SkeletonText className="w-48" tone="strong" />
    <div className="mt-6 space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  </div>
)

const ShowcaseEditorSignedOut = ({ onSignIn }: { onSignIn: () => void }) => (
  <div className={PAGE_TOP_LEVEL}>
    <SignedOutPrompt
      title={
        <h1 className="text-[28px] font-black text-[var(--t-text)]">
          Your tier list
        </h1>
      }
      body="Sign in to build and save the tier list shown on your profile."
      onSignIn={onSignIn}
    />
  </div>
)

const ShowcaseEditorSignedIn = () =>
{
  const editData = useQuery(api.platform.showcase.getMyProfileShowcase, {})
  const saveShowcase = useMutation(api.platform.showcase.saveProfileShowcase)
  const navigate = useNavigate()

  // pure derive — recomputing tiles on a reactive editData update is cheap; the
  // store is loaded only once (see the load effect) so edits aren't clobbered
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

  // load the showcase into the shared board store exactly once
  useEffect(() =>
  {
    if (loadedRef.current || !board) return
    loadedRef.current = true
    enterShowcaseEditing(board.snapshot)
  }, [board])

  // restore the real board when leaving the editor
  useEffect(
    () => () =>
    {
      exitShowcaseEditing()
      loadedRef.current = false
    },
    []
  )

  // debounce-persist store edits to Convex (the local autosave is gated)
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

  const handleAddTier = useCallback(
    () => useActiveBoardStore.getState().addTier(SHOWCASE_PALETTE_ID),
    []
  )

  const handleDoneEditing = useCallback(() =>
  {
    saveSchedulerRef.current?.flush()
    navigate(-1)
  }, [navigate])

  const tiles = board?.render.tiles
  const renderValue = useMemo(() => ({ tiles: tiles ?? EMPTY_TILES }), [tiles])

  if (!board)
  {
    return <ShowcaseEditorSkeleton />
  }

  return (
    <div className={PAGE_TOP_LEVEL}>
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleDoneEditing}
          aria-label="Done editing"
          className="focus-custom grid h-9 w-9 place-items-center rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </button>
        <div>
          <h1 className="text-[22px] font-black tracking-[-0.01em] text-[var(--t-text)]">
            Your tier list
          </h1>
          <p className="text-[13px] text-[var(--t-text-muted)]">
            Drag your published rankings into tiers. The rest stay in the pool.
            Changes save automatically.
          </p>
        </div>
      </div>

      <ShowcaseRenderContext.Provider value={renderValue}>
        <BoardRenderOverridesProvider
          itemSize={SHOWCASE_ITEM_SIZE}
          paletteId={SHOWCASE_PALETTE_ID}
        >
          <TierList
            toolbar={<ShowcaseToolbar onAddTier={handleAddTier} />}
            toolbarPosition="bottom"
            pool={<ShowcasePool />}
          />
        </BoardRenderOverridesProvider>
      </ShowcaseRenderContext.Provider>
    </div>
  )
}

export const ShowcaseEditorPage = () =>
{
  const session = useAuthSession()
  const showSignIn = useSignInPromptStore((state) => state.show)

  useDocumentTitle('Your tier list')

  if (session.status === 'signed-out')
  {
    return <ShowcaseEditorSignedOut onSignIn={showSignIn} />
  }

  if (session.status === 'loading')
  {
    return <ShowcaseEditorSkeleton />
  }

  return <ShowcaseEditorSignedIn key={session.user._id} />
}
