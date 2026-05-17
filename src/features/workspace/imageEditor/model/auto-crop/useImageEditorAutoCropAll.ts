// src/features/workspace/imageEditor/model/auto-crop/useImageEditorAutoCropAll.ts
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
  isCachedAutoCropApplied,
} from '~/shared/lib/autoCrop'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import { useCollectAutoCropTransformsRunner } from '~/shared/lib/useCollectAutoCropTransformsRunner'
import { useAutoCropCacheVersion } from '~/shared/lib/useAutoCropCache'
import type { PendingImageEditorPaneEdit } from '../pendingImageEdit'

interface UseImageEditorAutoCropAllInput
{
  filteredItems: readonly TierItem[]
  // bulk runner & cache helpers consult this per item for caption bands
  getBoardAspectRatioForItem: (item: TierItem) => number
  trimSoftShadows: boolean
  setItemsTransform: (
    entries: readonly { id: ItemId; transform: ItemTransform | null }[]
  ) => void
}

export const useImageEditorAutoCropAll = ({
  filteredItems,
  getBoardAspectRatioForItem,
  trimSoftShadows,
  setItemsTransform,
}: UseImageEditorAutoCropAllInput) =>
{
  useAutoCropCacheVersion()
  const {
    abort: cancelAutoCropAll,
    progress: autoCropProgress,
    run: runAutoCropTransforms,
  } = useCollectAutoCropTransformsRunner()

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
        getBoardAspectRatio: getBoardAspectRatioForItem,
        trimSoftShadows,
      })
      if (entries?.length) setItemsTransform(entries)
    },
    [
      getBoardAspectRatioForItem,
      filteredAutoCropTargets,
      filteredItems,
      runAutoCropTransforms,
      setItemsTransform,
      trimSoftShadows,
    ]
  )

  const autoCropAllApplied =
    !autoCropProgress.running &&
    areCachedAutoCropsApplied(
      filteredItems,
      getBoardAspectRatioForItem,
      trimSoftShadows
    )

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
      return isCachedAutoCropApplied(
        pendingItem,
        getBoardAspectRatioForItem(pendingItem),
        trimSoftShadows
      )
        ? null
        : pendingItem
    },
    [filteredItems, getBoardAspectRatioForItem, trimSoftShadows]
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
              !isCachedAutoCropApplied(
                it,
                getBoardAspectRatioForItem(it),
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
      getBoardAspectRatioForItem,
      filteredItems,
      getPendingManualTarget,
      trimSoftShadows,
    ]
  )

  return {
    autoCropProgress,
    autoCropAllApplied,
    cancelAutoCropAll,
    handleAutoCropAll,
    getManualAdjustmentCount,
  }
}
