// src/features/workspace/image-editor/model/labels/useBulkAspectRatioForItems.ts
// shared label-aware board-aspect resolver for bulk editor surfaces

import { useCallback, useMemo } from 'react'

import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  getItemLabelBandVariant,
  type LabelBandVariant,
} from '~/shared/board-ui/labels/labelBandVariant'
import { useLabelAwareEffectiveAspect } from '~/features/workspace/image-editor/model/labels/useLabelAwareEffectiveAspect'

interface UseBulkAspectRatioForItemsInput
{
  items: readonly TierItem[]
  boardAspectRatio: number
  itemSize: ItemSize
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
}

export const useBulkAspectRatioForItems = ({
  items,
  boardAspectRatio,
  itemSize,
  boardLabels,
  globalLabelDefaults,
}: UseBulkAspectRatioForItemsInput) =>
{
  const labelVariants = useMemo<readonly LabelBandVariant[]>(() =>
  {
    const variants: LabelBandVariant[] = []
    for (const item of items)
    {
      const variant = getItemLabelBandVariant({
        item,
        boardLabels,
        globalLabelDefaults,
      })
      if (variant) variants.push(variant)
    }
    return variants
  }, [items, boardLabels, globalLabelDefaults])

  const { getEffectiveAspectRatio, measurementsReady, measurementNodes } =
    useLabelAwareEffectiveAspect({
      boardAspectRatio,
      itemSize,
      variants: labelVariants,
    })

  const getBoardAspectRatioForItem = useCallback(
    (item: TierItem): number =>
      getEffectiveAspectRatio(
        getItemLabelBandVariant({ item, boardLabels, globalLabelDefaults })
      ),
    [getEffectiveAspectRatio, boardLabels, globalLabelDefaults]
  )

  return { getBoardAspectRatioForItem, measurementsReady, measurementNodes }
}
