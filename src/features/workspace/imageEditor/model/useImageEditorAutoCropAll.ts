// src/features/workspace/imageEditor/model/useImageEditorAutoCropAll.ts
// bulk auto-crop state for the image editor modal

import { useCallback, useMemo } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  areCachedAutoCropsApplied,
  getAutoCropImageRef,
} from '~/shared/lib/autoCrop'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import { useCollectAutoCropTransformsRunner } from '~/shared/lib/useCollectAutoCropTransformsRunner'
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
  useAutoCropCacheVersion()
  const { progress: autoCropProgress, run: runAutoCropTransforms } =
    useCollectAutoCropTransformsRunner()

  const filteredAutoCropTargets = useMemo(
    () => filteredItems.filter((it) => !!getAutoCropImageRef(it)),
    [filteredItems]
  )

  const handleAutoCropAll = useCallback(
    async (sourceItems: readonly TierItem[] = filteredItems) =>
    {
      const targets =
        sourceItems === filteredItems
          ? filteredAutoCropTargets
          : sourceItems.filter((it) => !!getAutoCropImageRef(it))
      if (targets.length === 0) return
      const entries = await runAutoCropTransforms({
        targets,
        boardAspectRatio,
        trimSoftShadows,
      })
      if (entries?.length) setItemsTransform(entries)
    },
    [
      boardAspectRatio,
      filteredAutoCropTargets,
      filteredItems,
      runAutoCropTransforms,
      setItemsTransform,
      trimSoftShadows,
    ]
  )

  const autoCropAllApplied =
    !autoCropProgress.running &&
    areCachedAutoCropsApplied(filteredItems, boardAspectRatio, trimSoftShadows)

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
      const manuallyAdjustedTargets = autoCropProgress.running
        ? []
        : filteredItems.filter(
            (it) =>
              !!it.transform &&
              !isIdentityTransform(it.transform) &&
              !areCachedAutoCropsApplied(
                [it],
                boardAspectRatio,
                trimSoftShadows
              )
          )
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
    [
      autoCropProgress.running,
      boardAspectRatio,
      filteredItems,
      getPendingManualTarget,
      trimSoftShadows,
    ]
  )

  return {
    autoCropProgress,
    autoCropAllApplied,
    handleAutoCropAll,
    getManualAdjustmentCount,
  }
}
