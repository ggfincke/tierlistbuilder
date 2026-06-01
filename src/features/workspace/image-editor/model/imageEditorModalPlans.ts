// src/features/workspace/image-editor/model/imageEditorModalPlans.ts
// pure adjustment counts & label apply-to-all plans for the image editor

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  isEmptyItemLabelOptions,
  type BoardLabelSettings,
  type GlobalLabelDefaults,
  type ItemTransform,
  type TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { resolveLabelLayout } from '~/shared/board-ui/labels/labelDisplay'
import {
  collectLabelOptionClearEntries,
  type LabelOptionsClearEntry,
} from '~/shared/board-ui/labels/labelOverrides'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import type { PendingImageEditorPaneEdit } from '~/features/workspace/image-editor/model/pendingImageEdit'

export type { LabelOptionsClearEntry } from '~/shared/board-ui/labels/labelOverrides'

interface ApplyLabelToAllPlan
{
  settings: BoardLabelSettings
  clearEntries: readonly LabelOptionsClearEntry[]
}

export const countAdjustedImageEditorItems = (
  allImageItems: readonly TierItem[],
  pendingEdit: PendingImageEditorPaneEdit | null
): number =>
{
  let count = 0
  for (const item of allImageItems)
  {
    const transform = resolvePendingTransform(item, pendingEdit)
    if (transform && !isIdentityTransform(transform)) count += 1
  }
  return count
}

const buildBoardLabelSettingsFromSource = ({
  source,
  boardLabels,
  globalLabelDefaults,
}: {
  source: TierItem
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
}): BoardLabelSettings =>
{
  const layout = resolveLabelLayout({
    itemOptions: source.labelOptions,
    boardSettings: boardLabels,
    globalLabelDefaults,
  })
  return {
    show: layout.visible,
    placement: layout.placement,
    scrim: layout.scrim,
    fontSizePx: layout.fontSizePx,
    textStyleId: layout.textStyleId,
    ...(layout.textColor !== 'auto' ? { textColor: layout.textColor } : {}),
  }
}

export const countLabelOverridesAffected = (
  sourceId: ItemId,
  items: Readonly<Record<ItemId, TierItem>>,
  allImageItems: readonly TierItem[]
): number =>
{
  if (!items[sourceId]) return 0
  let count = 0
  for (const item of allImageItems)
  {
    if (item.id === sourceId) continue
    if (!isEmptyItemLabelOptions(item.labelOptions)) count += 1
  }
  return count
}

export const createApplyLabelToAllPlan = ({
  sourceId,
  items,
  allImageItems,
  boardLabels,
  globalLabelDefaults,
}: {
  sourceId: ItemId
  items: Readonly<Record<ItemId, TierItem>>
  allImageItems: readonly TierItem[]
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
}): ApplyLabelToAllPlan | null =>
{
  const source = items[sourceId]
  if (!source) return null
  return {
    settings: buildBoardLabelSettingsFromSource({
      source,
      boardLabels,
      globalLabelDefaults,
    }),
    clearEntries: collectLabelOptionClearEntries(allImageItems),
  }
}

const resolvePendingTransform = (
  item: TierItem,
  pendingEdit: PendingImageEditorPaneEdit | null
): ItemTransform | undefined =>
{
  if (pendingEdit?.id !== item.id) return item.transform
  return pendingEdit.transform ?? undefined
}
