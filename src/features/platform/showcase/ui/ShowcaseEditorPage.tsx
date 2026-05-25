// src/features/platform/showcase/ui/ShowcaseEditorPage.tsx
// self-only tlotl editor — reuses the workspace dnd over a Convex-backed
// showcase. the global autosave is gated while this page owns the board store

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'

import { api } from '@convex/_generated/api'
import {
  SHOWCASE_TILE_MODES,
  SHOWCASE_TILE_MODE_DEFAULT,
  type ShowcaseTileMode,
} from '@tierlistbuilder/contracts/platform/showcase'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { TierList } from '~/features/workspace/boards/ui/tier-list/TierList'
import { ShowcaseRenderContext } from '~/shared/board-ui/ShowcaseRenderContext'
import {
  boardDataFieldsEqual,
  extractBoardData,
} from '~/shared/board-data/boardSnapshot'
import {
  boardSnapshotToShowcaseSave,
  editShowcaseToSnapshot,
} from '~/features/platform/showcase/model/showcaseSnapshot'
import {
  enterShowcaseEditing,
  exitShowcaseEditing,
} from '~/features/platform/showcase/model/showcaseSession'

const PAGE_CLASS =
  'relative z-10 mx-auto w-full max-w-[1320px] px-4 pb-24 pt-20 sm:px-8 sm:pt-24'

const SAVE_DEBOUNCE_MS = 500

const TileModeToggle = ({
  value,
  onChange,
}: {
  value: ShowcaseTileMode
  onChange: (mode: ShowcaseTileMode) => void
}) => (
  <div className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--t-border)] p-0.5">
    {SHOWCASE_TILE_MODES.map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => onChange(mode)}
        aria-pressed={value === mode}
        className={`focus-custom rounded-md px-2.5 py-1 text-[12px] font-bold transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
          value === mode
            ? 'bg-[var(--t-bg-active)] text-[var(--t-text)]'
            : 'text-[var(--t-text-secondary)] hover:text-[var(--t-text)]'
        }`}
      >
        {mode === 'mini' ? 'Mini' : 'Covers'}
      </button>
    ))}
  </div>
)

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
  <div className={PAGE_CLASS} aria-hidden="true">
    <SkeletonText className="w-48" tone="strong" />
    <div className="mt-6 space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  </div>
)

export const ShowcaseEditorPage = () =>
{
  const editData = useQuery(api.platform.showcase.getMyProfileShowcase, {})
  const saveShowcase = useMutation(api.platform.showcase.saveProfileShowcase)
  const paletteId = useCurrentPaletteId()
  const navigate = useNavigate()

  // pure derive — recomputing tiles on a reactive editData update is cheap; the
  // store is loaded only once (see the load effect) so edits aren't clobbered
  const board = useMemo(
    () => (editData ? editShowcaseToSnapshot(editData) : null),
    [editData]
  )

  // toggle override layered over the saved mode so we never seed state from the
  // query inside an effect
  const [tileModeOverride, setTileModeOverride] =
    useState<ShowcaseTileMode | null>(null)
  const tileMode =
    tileModeOverride ?? editData?.tileMode ?? SHOWCASE_TILE_MODE_DEFAULT
  const tileModeRef = useRef(tileMode)
  const loadedRef = useRef(false)

  useDocumentTitle('Your tier list')

  // keep the ref current so the debounced save closure reads the latest mode
  useEffect(() =>
  {
    tileModeRef.current = tileMode
  }, [tileMode])

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
    let timeout: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useActiveBoardStore.subscribe(
      (state) => state,
      () =>
      {
        if (!loadedRef.current) return
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() =>
        {
          const snapshot = extractBoardData(useActiveBoardStore.getState())
          void saveShowcase(
            boardSnapshotToShowcaseSave(snapshot, tileModeRef.current)
          )
        }, SAVE_DEBOUNCE_MS)
      },
      { equalityFn: boardDataFieldsEqual }
    )
    return () =>
    {
      if (timeout) clearTimeout(timeout)
      unsubscribe()
    }
  }, [saveShowcase])

  const handleTileMode = (mode: ShowcaseTileMode) =>
  {
    if (mode === tileMode) return
    setTileModeOverride(mode)
    const snapshot = extractBoardData(useActiveBoardStore.getState())
    void saveShowcase(boardSnapshotToShowcaseSave(snapshot, mode))
  }

  const handleAddTier = () => useActiveBoardStore.getState().addTier(paletteId)

  if (!board)
  {
    return <ShowcaseEditorSkeleton />
  }

  return (
    <div className={PAGE_CLASS}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
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
              Drag your published rankings into tiers. The rest stay in the
              pool. Changes save automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--t-text-faint)]">
            Profile tiles
          </span>
          <TileModeToggle value={tileMode} onChange={handleTileMode} />
        </div>
      </div>

      <ShowcaseRenderContext.Provider
        value={{ tileMode, tiles: board.render.tiles }}
      >
        <TierList
          toolbar={<ShowcaseToolbar onAddTier={handleAddTier} />}
          toolbarPosition="bottom"
        />
      </ShowcaseRenderContext.Provider>
    </div>
  )
}
