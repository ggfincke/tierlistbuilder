// src/features/workspace/imageEditor/model/useImageEditorAutoCropAll.ts
// bulk auto-crop state for the image editor modal

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  areCachedAutoCropsApplied,
  collectAutoCropTransforms,
  getAutoCropImageRef,
} from '~/shared/lib/autoCrop'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import { useAutoCropCacheVersion } from '~/shared/lib/useAutoCropCache'
import type { PendingImageEditorPaneEdit } from './pendingImageEdit'

interface UseImageEditorAutoCropAllInput
{
  filteredItems: readonly TierItem[]
  boardAspectRatio: number
  trimSoftShadows: boolean
  setItemsTransform: (
    entries: readonly { id: ItemId; transform: ItemTransform | null }[]
  ) => void
}

export const useImageEditorAutoCropAll = ({
  filteredItems,
  boardAspectRatio,
  trimSoftShadows,
  setItemsTransform,
}: UseImageEditorAutoCropAllInput) =>
{
  const [autoCropProgress, setAutoCropProgress] = useState<{
    running: boolean
    done: number
    total: number
  }>({ running: false, done: 0, total: 0 })
  const autoCropCacheVersion = useAutoCropCacheVersion()
  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () =>
    {
      abortRef.current?.abort()
    },
    []
  )

  const handleAutoCropAll = useCallback(
    async (sourceItems: readonly TierItem[] = filteredItems) =>
    {
      const targets = sourceItems.filter((it) => !!getAutoCropImageRef(it))
      if (targets.length === 0) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setAutoCropProgress({ running: true, done: 0, total: targets.length })
      try
      {
        const entries = await collectAutoCropTransforms({
          targets,
          boardAspectRatio,
          trimSoftShadows,
          signal: controller.signal,
          onProgress: () =>
            setAutoCropProgress((p) =>
              p.running ? { ...p, done: p.done + 1 } : p
            ),
        })
        if (controller.signal.aborted) return
        if (entries.length > 0) setItemsTransform(entries)
      }
      catch (err)
      {
        if (!(err instanceof DOMException && err.name === 'AbortError'))
          throw err
      }
      finally
      {
        if (abortRef.current === controller) abortRef.current = null
        setAutoCropProgress({ running: false, done: 0, total: 0 })
      }
    },
    [trimSoftShadows, filteredItems, boardAspectRatio, setItemsTransform]
  )

  // autoCropCacheVersion is referenced via `void` so the version bump retriggers
  // the memo even though the variable isn't used in the body
  const autoCropAllApplied = useMemo(() =>
  {
    void autoCropCacheVersion
    if (autoCropProgress.running) return false
    return areCachedAutoCropsApplied(
      filteredItems,
      boardAspectRatio,
      trimSoftShadows
    )
  }, [
    autoCropCacheVersion,
    autoCropProgress.running,
    boardAspectRatio,
    filteredItems,
    trimSoftShadows,
  ])

  const manuallyAdjustedTargets = useMemo(() =>
  {
    void autoCropCacheVersion
    // bulk auto-crop emits a cache bump per processed item; recomputing the
    // O(N) filter on every bump turns the run into O(N^2) in `filteredItems`.
    // skip while running — the post-batch re-run gives the final answer
    if (autoCropProgress.running) return []
    return filteredItems.filter(
      (it) =>
        !!it.transform &&
        !isIdentityTransform(it.transform) &&
        !areCachedAutoCropsApplied([it], boardAspectRatio, trimSoftShadows)
    )
  }, [
    autoCropCacheVersion,
    autoCropProgress.running,
    boardAspectRatio,
    filteredItems,
    trimSoftShadows,
  ])

  const getPendingManualTarget = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): TierItem | null =>
    {
      if (!pendingEdit) return null
      const item = filteredItems.find((it) => it.id === pendingEdit.id)
      if (!item || !getAutoCropImageRef(item)) return null
      const pendingItem: TierItem = {
        ...item,
        transform: pendingEdit.transform ?? undefined,
      }
      return areCachedAutoCropsApplied(
        [pendingItem],
        boardAspectRatio,
        trimSoftShadows
      )
        ? null
        : pendingItem
    },
    [filteredItems, boardAspectRatio, trimSoftShadows]
  )

  const getManualAdjustmentCount = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): number =>
    {
      const pendingTarget = getPendingManualTarget(pendingEdit)
      if (
        !pendingTarget ||
        manuallyAdjustedTargets.some((it) => it.id === pendingTarget.id)
      )
      {
        return manuallyAdjustedTargets.length
      }
      return manuallyAdjustedTargets.length + 1
    },
    [getPendingManualTarget, manuallyAdjustedTargets]
  )

  return {
    autoCropProgress,
    autoCropAllApplied,
    handleAutoCropAll,
    getManualAdjustmentCount,
  }
}
