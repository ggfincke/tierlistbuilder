// src/features/workspace/settings/model/useAutoCropController.ts
// auto-crop preview, cancellation, & stale-transform cleanup for ratio prompt

import { useCallback, useMemo, useRef, useState } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  areCachedAutoCropsApplied,
  type AutoCropTransformEntry,
} from '~/shared/lib/autoCrop'
import {
  type AutoCropProgress,
  useCollectAutoCropTransformsRunner,
} from '~/shared/lib/useCollectAutoCropTransformsRunner'
import { logger } from '~/shared/lib/logger'
import { useAutoCropCacheVersion } from '~/shared/lib/useAutoCropCache'

const DEBUG_TARGET_ID_LIMIT = 20

// `auto` is prompt-open preview only; it must not set manual selection.
// Manual selection belongs only to a user pressing Auto-crop all.
// Do not re-add target reruns w/o explicit clarification.
type AutoCropRunSource = 'auto' | 'manual'
type AutoCropClearReason = 'adjust' | 'fit' | 'ratio'

interface UseAutoCropControllerInput
{
  boardAspectRatio: number
  cleanupTargets: readonly TierItem[]
  currentMismatchItems: readonly TierItem[]
  openingMismatchCount: number
  pendingBulkFit: ImageFit | null
  setItemsTransform: (entries: readonly AutoCropTransformEntry[]) => void
  setPendingBulkFit: (fit: ImageFit | null) => void
  targets: readonly TierItem[]
  trimSoftShadows: boolean
}

interface AutoCropController
{
  applied: boolean
  available: boolean
  progress: AutoCropProgress
  run: () => void
  runAutoDefault: () => void
  selected: boolean
  clearPreview: (reason: AutoCropClearReason) => void
}

const sampleItemIds = (items: readonly TierItem[]): ItemId[] =>
  items.slice(0, DEBUG_TARGET_ID_LIMIT).map((item) => item.id)

export const useAutoCropController = ({
  boardAspectRatio,
  cleanupTargets,
  currentMismatchItems,
  openingMismatchCount,
  pendingBulkFit,
  setItemsTransform,
  setPendingBulkFit,
  targets,
  trimSoftShadows,
}: UseAutoCropControllerInput): AutoCropController =>
{
  const [manualAutoCropSelected, setManualAutoCropSelected] = useState(false)
  const [autoCropTouchedPreview, setAutoCropTouchedPreview] = useState(false)
  useAutoCropCacheVersion()
  const autoCropTouchedIdsRef = useRef<Set<ItemId>>(new Set())
  const {
    abort: abortAutoCrop,
    progress: autoCropProgress,
    run: runAutoCropTransforms,
  } = useCollectAutoCropTransformsRunner()

  const autoCropAllApplied =
    !autoCropProgress.running &&
    areCachedAutoCropsApplied(targets, boardAspectRatio, trimSoftShadows)
  const autoCropApplied = pendingBulkFit === null && autoCropAllApplied
  const autoCropSelected =
    pendingBulkFit === null &&
    (manualAutoCropSelected ||
      autoCropProgress.running ||
      autoCropTouchedPreview ||
      autoCropApplied)

  const clearAutoCropTransforms = useCallback(
    (reason: AutoCropClearReason) =>
    {
      const idsToClear = new Set<ItemId>(autoCropTouchedIdsRef.current)
      for (const item of targets) idsToClear.add(item.id)
      const resetEntries = [...idsToClear].map((id) => ({
        id,
        transform: null,
      }))
      autoCropTouchedIdsRef.current.clear()
      setAutoCropTouchedPreview(false)
      if (resetEntries.length === 0) return
      logger.info('autoCrop', 'issue modal auto-crop cleared', {
        reason,
        resetEntries: resetEntries.length,
        resetEntryIds: resetEntries
          .slice(0, DEBUG_TARGET_ID_LIMIT)
          .map((entry) => entry.id),
      })
      setItemsTransform(resetEntries)
    },
    [setItemsTransform, targets]
  )

  const clearPreview = useCallback(
    (reason: AutoCropClearReason) =>
    {
      setManualAutoCropSelected(false)
      abortAutoCrop()
      clearAutoCropTransforms(reason)
    },
    [abortAutoCrop, clearAutoCropTransforms]
  )

  const runAutoCropAll = useCallback(
    async (source: AutoCropRunSource) =>
    {
      if (targets.length === 0 || autoCropProgress.running) return
      if (source === 'manual') setManualAutoCropSelected(true)
      setPendingBulkFit(null)
      logger.info('autoCrop', 'issue modal auto-crop started', {
        source,
        boardAspectRatio,
        openingMismatchCount,
        currentMismatchCount: currentMismatchItems.length,
        cleanupTargetCount: cleanupTargets.length,
        autoCropTargetCount: targets.length,
        currentMismatchIds: sampleItemIds(currentMismatchItems),
        cleanupTargetIds: sampleItemIds(cleanupTargets),
        autoCropTargetIds: sampleItemIds(targets),
      })

      const entries = await runAutoCropTransforms({
        targets,
        boardAspectRatio,
        trimSoftShadows,
        onError: (error) =>
        {
          logger.warn('autoCrop', 'issue modal auto-crop failed', error)
        },
      })
      if (!entries) return

      const resetEntries = entries.filter((entry) => entry.transform === null)
      const croppedEntries = entries.length - resetEntries.length
      logger.info('autoCrop', 'issue modal auto-crop finished', {
        source,
        boardAspectRatio,
        entries: entries.length,
        croppedEntries,
        resetEntries: resetEntries.length,
        entryIds: entries
          .slice(0, DEBUG_TARGET_ID_LIMIT)
          .map((entry) => entry.id),
      })
      if (entries.length > 0)
      {
        for (const entry of entries) autoCropTouchedIdsRef.current.add(entry.id)
        setAutoCropTouchedPreview(true)
        setItemsTransform(entries)
      }
    },
    [
      autoCropProgress.running,
      boardAspectRatio,
      cleanupTargets,
      currentMismatchItems,
      openingMismatchCount,
      runAutoCropTransforms,
      setItemsTransform,
      setPendingBulkFit,
      targets,
      trimSoftShadows,
    ]
  )

  const run = useCallback(() =>
  {
    void runAutoCropAll('manual')
  }, [runAutoCropAll])

  const runAutoDefault = useCallback(() =>
  {
    void runAutoCropAll('auto')
  }, [runAutoCropAll])

  return useMemo(
    () => ({
      applied: autoCropApplied,
      available: targets.length > 0,
      progress: autoCropProgress,
      run,
      runAutoDefault,
      selected: autoCropSelected,
      clearPreview,
    }),
    [
      autoCropApplied,
      autoCropSelected,
      autoCropProgress,
      clearPreview,
      run,
      runAutoDefault,
      targets.length,
    ]
  )
}
