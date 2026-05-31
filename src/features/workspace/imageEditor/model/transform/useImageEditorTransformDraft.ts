// src/features/workspace/imageEditor/model/transform/useImageEditorTransformDraft.ts
// transform draft for the editor pane: layers commit resolution, saved-flash, &
// pending-edit onto the generic useDebouncedDraft lifecycle

import {
  useCallback,
  useEffect,
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
} from '~/features/workspace/imageEditor/lib/imageEditorGeometry'
import {
  centerImageEditorTransform,
  resolveImageEditorCommitTransform,
  rotateImageEditorWorkingTransform,
  setImageEditorDisplayZoom,
} from '~/features/workspace/imageEditor/lib/imageEditorTransformOps'
import { useDebouncedDraft } from '~/features/workspace/imageEditor/model/transform/useDebouncedDraft'
import type { PendingImageEditorPaneEdit } from '~/features/workspace/imageEditor/model/pendingImageEdit'

export type ImageEditorTransformDraftSetter = Dispatch<
  SetStateAction<ItemTransform>
>

const AUTO_COMMIT_MS = 350
const SAVED_FLASH_MS = 1200

interface UseImageEditorTransformDraftInput
{
  item: TierItem
  frameAspectRatio: number
  effectiveFit: ImageFit
  onCommit: (transform: ItemTransform | null) => void
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

  const [savedFlash, setSavedFlash] = useState(false)
  const savedFlashTimerRef = useRef<number | null>(null)

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
    }, SAVED_FLASH_MS)
  }, [clearSavedFlashTimer])

  const resolveCommitTransform = useCallback(
    (transform: ItemTransform): ItemTransform | null =>
      resolveImageEditorCommitTransform(transform, fitBaseline),
    [fitBaseline]
  )
  const flushCommit = useCallback(
    (transform: ItemTransform) => onCommit(resolveCommitTransform(transform)),
    [onCommit, resolveCommitTransform]
  )
  // a fresh edit hides the "saved" flash from the prior auto-commit
  const handleWorkingChange = useCallback(
    (_: ItemTransform, dirty: boolean) =>
    {
      if (dirty) setSavedFlash(false)
    },
    []
  )

  const seedWorking = useCallback(
    () => seedTransform(item, frameAspectRatio, effectiveFit),
    // seed runs once for the initial mount; later item swaps re-sync via committed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const { working, isDirty, setWorking, flush, readDirty } = useDebouncedDraft({
    committed,
    seedWorking,
    equals: isSameItemTransform,
    autoCommitMs: AUTO_COMMIT_MS,
    onFlush: flushCommit,
    onAutoCommit: showSavedFlash,
    onWorkingChange: handleWorkingChange,
  })
  const setWorkingDraft: ImageEditorTransformDraftSetter = setWorking

  useEffect(() => clearSavedFlashTimer, [clearSavedFlashTimer])

  const getPendingTransformEdit =
    useCallback((): PendingImageEditorPaneEdit | null =>
    {
      const pending = readDirty()
      return pending
        ? { id: item.id, transform: resolveCommitTransform(pending) }
        : null
    }, [item.id, readDirty, resolveCommitTransform])

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
    flushPendingTransform: flush,
    rotate,
    setZoomLive,
    reset,
    centerOffsets,
  }
}
