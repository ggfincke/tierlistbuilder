// src/features/workspace/imageEditor/model/useImageEditorAutoCropAll.ts
// bulk auto-crop state for the image editor modal

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  areCachedAutoCropsApplied,
  collectAutoCropTransforms,
  getAutoCropCacheVersion,
  getAutoCropHash,
  subscribeAutoCropCache,
} from '~/shared/lib/autoCrop'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
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
  const autoCropCacheVersion = useSyncExternalStore(
    subscribeAutoCropCache,
    getAutoCropCacheVersion,
    getAutoCropCacheVersion
  )

  const handleAutoCropAll = useCallback(
    async (sourceItems: readonly TierItem[] = filteredItems) =>
    {
      const targets = sourceItems.filter((it) => !!getAutoCropHash(it))
      if (targets.length === 0) return
      setAutoCropProgress({ running: true, done: 0, total: targets.length })
      try
      {
        const entries = await collectAutoCropTransforms({
          targets,
          boardAspectRatio,
          trimSoftShadows,
          onProgress: () =>
            setAutoCropProgress((p) =>
              p.running ? { ...p, done: p.done + 1 } : p
            ),
        })
        if (entries.length > 0) setItemsTransform(entries)
      }
      finally
      {
        setAutoCropProgress({ running: false, done: 0, total: 0 })
      }
    },
    [trimSoftShadows, filteredItems, boardAspectRatio, setItemsTransform]
  )

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
    return filteredItems.filter(
      (it) =>
        !!it.transform &&
        !isIdentityTransform(it.transform) &&
        !areCachedAutoCropsApplied([it], boardAspectRatio, trimSoftShadows)
    )
  }, [autoCropCacheVersion, boardAspectRatio, filteredItems, trimSoftShadows])

  const getPendingManualTarget = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): TierItem | null =>
    {
      if (!pendingEdit) return null
      const item = filteredItems.find((it) => it.id === pendingEdit.id)
      if (!item || !getAutoCropHash(item)) return null
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
