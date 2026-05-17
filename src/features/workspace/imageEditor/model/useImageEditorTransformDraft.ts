// src/features/workspace/imageEditor/model/useImageEditorTransformDraft.ts
// transform draft state, autosave, & dirty tracking for the editor pane

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

import type {
  ImageFit,
  ItemRotation,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { isSameItemTransform } from '~/shared/lib/imageTransform'
import {
  createFitBaselineTransformForAspectRatio,
  getDisplayZoomBounds,
  getSavedTransform,
  seedTransform,
  SLIDER_ZOOM_MAX,
} from '../lib/imageEditorGeometry'
import {
  centerImageEditorTransform,
  resolveImageEditorCommitTransform,
  rotateImageEditorWorkingTransform,
  setImageEditorDisplayZoom,
} from '../lib/imageEditorTransformOps'
import {
  syncImageEditorTransformDraftState,
  type ImageEditorTransformDraftState,
} from './imageEditorTransformDraftState'
import type { PendingImageEditorPaneEdit } from './pendingImageEdit'

export type ImageEditorTransformDraftSetter = Dispatch<
  SetStateAction<ItemTransform>
>

interface UseImageEditorTransformDraftInput
{
  item: TierItem
  frameAspectRatio: number
  effectiveFit: ImageFit
  onCommit: (transform: ItemTransform | null) => void
}

interface TransformDraftRuntime
{
  working: ItemTransform
  committed: ItemTransform
  isDirty: boolean
  flushCommit: (transform: ItemTransform) => void
  itemId: TierItem['id']
  resolveCommitTransform: (transform: ItemTransform) => ItemTransform | null
}

export const useImageEditorTransformDraft = ({
  item,
  frameAspectRatio,
  effectiveFit,
  onCommit,
}: UseImageEditorTransformDraftInput) =>
{
  const itemAspectRatio = item.aspectRatio
  const fitBaseline = useMemo(
    () =>
      createFitBaselineTransformForAspectRatio(
        itemAspectRatio,
        frameAspectRatio,
        effectiveFit
      ),
    [itemAspectRatio, frameAspectRatio, effectiveFit]
  )
  const savedTransform = getSavedTransform(item)
  const hasSavedTransform = !!savedTransform
  const committed = savedTransform ?? fitBaseline
  const [draftState, setDraftState] = useState<ImageEditorTransformDraftState>(
    () =>
    {
      const working = seedTransform(item, frameAspectRatio, effectiveFit)
      return { working, committed }
    }
  )
  const syncedDraftState = useMemo(
    () => syncImageEditorTransformDraftState(draftState, committed),
    [committed, draftState]
  )
  if (syncedDraftState !== draftState)
  {
    setDraftState(syncedDraftState)
  }
  const working = syncedDraftState.working
  const [savedFlash, setSavedFlash] = useState(false)

  const resolveCommitTransform = useCallback(
    (transform: ItemTransform): ItemTransform | null =>
      resolveImageEditorCommitTransform(transform, fitBaseline),
    [fitBaseline]
  )
  const flushCommit = useCallback(
    (transform: ItemTransform) => onCommit(resolveCommitTransform(transform)),
    [onCommit, resolveCommitTransform]
  )

  const isDirty = !isSameItemTransform(working, committed)
  const runtimeRef = useRef<TransformDraftRuntime>({
    working,
    committed,
    isDirty,
    flushCommit,
    itemId: item.id,
    resolveCommitTransform,
  })
  const autoCommitTimerRef = useRef<number | null>(null)
  const savedFlashTimerRef = useRef<number | null>(null)

  useLayoutEffect(() =>
  {
    runtimeRef.current = {
      working,
      committed,
      isDirty,
      flushCommit,
      itemId: item.id,
      resolveCommitTransform,
    }
  }, [
    committed,
    flushCommit,
    isDirty,
    item.id,
    resolveCommitTransform,
    working,
  ])

  const clearAutoCommitTimer = useCallback(() =>
  {
    if (autoCommitTimerRef.current === null) return
    window.clearTimeout(autoCommitTimerRef.current)
    autoCommitTimerRef.current = null
  }, [])

  const clearSavedFlashTimer = useCallback(() =>
  {
    if (savedFlashTimerRef.current === null) return
    window.clearTimeout(savedFlashTimerRef.current)
    savedFlashTimerRef.current = null
  }, [])

  const showSavedFlash = useCallback(() =>
  {
    clearSavedFlashTimer()
    setSavedFlash(true)
    savedFlashTimerRef.current = window.setTimeout(() =>
    {
      savedFlashTimerRef.current = null
      setSavedFlash(false)
    }, 1200)
  }, [clearSavedFlashTimer])

  const scheduleAutoCommit = useCallback(() =>
  {
    clearAutoCommitTimer()
    autoCommitTimerRef.current = window.setTimeout(() =>
    {
      autoCommitTimerRef.current = null
      const runtime = runtimeRef.current
      if (!runtime.isDirty) return
      runtime.flushCommit(runtime.working)
      runtime.isDirty = false
      showSavedFlash()
    }, 350)
  }, [clearAutoCommitTimer, showSavedFlash])

  const setWorkingDraft = useCallback<ImageEditorTransformDraftSetter>(
    (nextOrUpdate) =>
    {
      const runtime = runtimeRef.current
      const current = runtime.working
      const next =
        typeof nextOrUpdate === 'function'
          ? nextOrUpdate(current)
          : nextOrUpdate
      if (isSameItemTransform(current, next)) return
      runtime.working = next
      const nextDirty = !isSameItemTransform(next, runtime.committed)
      runtime.isDirty = nextDirty
      if (nextDirty)
      {
        setSavedFlash(false)
        scheduleAutoCommit()
      }
      else
      {
        clearAutoCommitTimer()
      }
      const nextDraftState = { working: next, committed: runtime.committed }
      setDraftState(nextDraftState)
    },
    [clearAutoCommitTimer, scheduleAutoCommit]
  )

  useEffect(
    () => () =>
    {
      clearAutoCommitTimer()
      clearSavedFlashTimer()
      const runtime = runtimeRef.current
      if (runtime.isDirty) runtime.flushCommit(runtime.working)
    },
    [clearAutoCommitTimer, clearSavedFlashTimer]
  )

  const getPendingTransformEdit =
    useCallback((): PendingImageEditorPaneEdit | null =>
    {
      const runtime = runtimeRef.current
      return runtime.isDirty
        ? {
            id: runtime.itemId,
            transform: runtime.resolveCommitTransform(runtime.working),
          }
        : null
    }, [])

  const flushPendingTransform = useCallback(() =>
  {
    const runtime = runtimeRef.current
    if (!runtime.isDirty) return
    clearAutoCommitTimer()
    runtime.flushCommit(runtime.working)
    runtime.isDirty = false
  }, [clearAutoCommitTimer])

  const getFitBaselineZoom = useCallback(
    (rotation: ItemRotation) =>
      createFitBaselineTransformForAspectRatio(
        itemAspectRatio,
        frameAspectRatio,
        effectiveFit,
        rotation
      ).zoom,
    [itemAspectRatio, frameAspectRatio, effectiveFit]
  )

  const rotate = useCallback(
    (delta: 90 | -90) =>
    {
      setWorkingDraft((current) =>
        rotateImageEditorWorkingTransform(current, delta, getFitBaselineZoom)
      )
    },
    [getFitBaselineZoom, setWorkingDraft]
  )

  const setZoomLive = useCallback(
    (zoom: number) =>
      setWorkingDraft((current) =>
        setImageEditorDisplayZoom(
          current,
          zoom,
          getFitBaselineZoom(current.rotation)
        )
      ),
    [getFitBaselineZoom, setWorkingDraft]
  )

  const reset = useCallback(() =>
  {
    setWorkingDraft(fitBaseline)
  }, [fitBaseline, setWorkingDraft])

  const centerOffsets = useCallback(() =>
  {
    setWorkingDraft(centerImageEditorTransform)
  }, [setWorkingDraft])

  const zoomBaseline = getFitBaselineZoom(working.rotation)
  const displayZoom = working.zoom / zoomBaseline
  const { min: displayZoomMin, max: displayZoomMax } =
    getDisplayZoomBounds(zoomBaseline)
  const displaySliderZoomMax = Math.min(
    Math.max(SLIDER_ZOOM_MAX, displayZoom),
    displayZoomMax
  )
  const hasChanges =
    hasSavedTransform || !isSameItemTransform(working, fitBaseline)

  return {
    working,
    setWorkingDraft,
    isDirty,
    savedFlash,
    hasChanges,
    displayZoom,
    displayZoomMin,
    displaySliderZoomMax,
    getFitBaselineZoom,
    getPendingTransformEdit,
    flushPendingTransform,
    rotate,
    setZoomLive,
    reset,
    centerOffsets,
  }
}
