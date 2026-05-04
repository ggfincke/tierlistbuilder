// src/features/workspace/settings/model/useAutoCropController.ts
// auto-crop intent, cancellation, & stale-transform cleanup for ratio prompt

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  areCachedAutoCropsApplied,
  getAutoCropImageRef,
  type AutoCropTransformEntry,
} from '~/shared/lib/autoCrop'
import {
  type AutoCropProgress,
  useCollectAutoCropTransformsRunner,
} from '~/shared/lib/useCollectAutoCropTransformsRunner'
import { logger } from '~/shared/lib/logger'
import { useAutoCropCacheVersion } from '~/shared/lib/useAutoCropCache'

const DEBUG_TARGET_ID_LIMIT = 20

type AutoCropRunSource = 'manual' | 'intent'
export type AutoCropClearReason = 'fit' | 'ratio'

interface AutoCropRunSignatureItem
{
  id: ItemId
  hash: string
  aspectRatio: number | null
}

interface AutoCropRunSignature
{
  boardAspectRatio: number
  trimSoftShadows: boolean
  targets: AutoCropRunSignatureItem[]
}

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
  available: boolean
  honored: boolean
  intent: boolean
  progress: AutoCropProgress
  run: () => void
  tearDownIntent: (reason: AutoCropClearReason) => void
}

const sampleItemIds = (items: readonly TierItem[]): ItemId[] =>
  items.slice(0, DEBUG_TARGET_ID_LIMIT).map((item) => item.id)

const createRunSignature = (
  targets: readonly TierItem[],
  boardAspectRatio: number,
  trimSoftShadows: boolean
): AutoCropRunSignature => ({
  boardAspectRatio,
  trimSoftShadows,
  targets: targets.map((item) => ({
    id: item.id,
    hash: getAutoCropImageRef(item)?.hash ?? '',
    aspectRatio: item.aspectRatio ?? null,
  })),
})

const runSignatureMatches = (
  signature: AutoCropRunSignature | null,
  targets: readonly TierItem[],
  boardAspectRatio: number,
  trimSoftShadows: boolean
): boolean =>
{
  if (!signature) return false
  if (signature.boardAspectRatio !== boardAspectRatio) return false
  if (signature.trimSoftShadows !== trimSoftShadows) return false
  if (signature.targets.length !== targets.length) return false
  for (let i = 0; i < targets.length; i++)
  {
    const item = targets[i]
    const signed = signature.targets[i]
    if (signed.id !== item.id) return false
    if (signed.hash !== (getAutoCropImageRef(item)?.hash ?? '')) return false
    if (signed.aspectRatio !== (item.aspectRatio ?? null)) return false
  }
  return true
}

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
  const [autoCropIntent, setAutoCropIntent] = useState(false)
  useAutoCropCacheVersion()
  const autoCropTouchedIdsRef = useRef<Set<ItemId>>(new Set())
  const lastRunRef = useRef<AutoCropRunSignature | null>(null)
  const {
    abort: abortAutoCrop,
    progress: autoCropProgress,
    run: runAutoCropTransforms,
  } = useCollectAutoCropTransformsRunner()

  const autoCropAllApplied =
    !autoCropProgress.running &&
    areCachedAutoCropsApplied(targets, boardAspectRatio, trimSoftShadows)
  const autoCropHonored = pendingBulkFit === null && autoCropAllApplied

  const lastRunMatches = useCallback(
    () =>
      runSignatureMatches(
        lastRunRef.current,
        targets,
        boardAspectRatio,
        trimSoftShadows
      ),
    [boardAspectRatio, targets, trimSoftShadows]
  )

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

  const tearDownIntent = useCallback(
    (reason: AutoCropClearReason) =>
    {
      setAutoCropIntent(false)
      abortAutoCrop()
      lastRunRef.current = null
      clearAutoCropTransforms(reason)
    },
    [abortAutoCrop, clearAutoCropTransforms]
  )

  const runAutoCropAll = useCallback(
    async (source: AutoCropRunSource) =>
    {
      if (targets.length === 0 || autoCropProgress.running) return
      if (source === 'manual') setAutoCropIntent(true)
      setPendingBulkFit(null)
      lastRunRef.current = createRunSignature(
        targets,
        boardAspectRatio,
        trimSoftShadows
      )
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

  useEffect(() =>
  {
    if (!autoCropIntent || autoCropHonored) return
    if (autoCropProgress.running)
    {
      if (!lastRunMatches()) abortAutoCrop()
      return
    }
    if (targets.length === 0 || lastRunMatches()) return
    let cancelled = false
    queueMicrotask(() =>
    {
      if (!cancelled) void runAutoCropAll('intent')
    })
    return () =>
    {
      cancelled = true
    }
  }, [
    abortAutoCrop,
    autoCropHonored,
    autoCropIntent,
    autoCropProgress.running,
    lastRunMatches,
    runAutoCropAll,
    targets.length,
  ])

  const run = useCallback(() =>
  {
    void runAutoCropAll('manual')
  }, [runAutoCropAll])

  return useMemo(
    () => ({
      available: targets.length > 0,
      honored: autoCropHonored,
      intent: autoCropIntent,
      progress: autoCropProgress,
      run,
      tearDownIntent,
    }),
    [
      autoCropHonored,
      autoCropIntent,
      autoCropProgress,
      run,
      targets.length,
      tearDownIntent,
    ]
  )
}
