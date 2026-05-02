// src/features/workspace/imageEditor/model/imageEditorModalPlans.ts
// pure adjustment counts & label apply-to-all plans for the image editor

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardLabelSettings,
  ItemLabelOptions,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { resolveLabelLayout } from '~/shared/board-ui/labelDisplay'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import type { PendingImageEditorPaneEdit } from './pendingImageEdit'

export interface LabelOptionsClearEntry
{
  id: ItemId
  options: ItemLabelOptions | null
}

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

export const buildBoardLabelSettingsFromSource = ({
  source,
  boardLabels,
  globalShowLabels,
}: {
  source: TierItem
  boardLabels: BoardLabelSettings | undefined
  globalShowLabels: boolean
}): BoardLabelSettings =>
{
  const layout = resolveLabelLayout({
    itemOptions: source.labelOptions,
    boardSettings: boardLabels,
    globalShowLabels,
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

export const collectLabelOptionClearEntries = (
  allImageItems: readonly TierItem[]
): LabelOptionsClearEntry[] =>
  allImageItems
    .filter((item) => !!item.labelOptions)
    .map((item) => ({ id: item.id, options: null }))

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
    if (item.labelOptions) count += 1
  }
  return count
}

export const createApplyLabelToAllPlan = ({
  sourceId,
  items,
  allImageItems,
  boardLabels,
  globalShowLabels,
}: {
  sourceId: ItemId
  items: Readonly<Record<ItemId, TierItem>>
  allImageItems: readonly TierItem[]
  boardLabels: BoardLabelSettings | undefined
  globalShowLabels: boolean
}): ApplyLabelToAllPlan | null =>
{
  const source = items[sourceId]
  if (!source) return null
  return {
    settings: buildBoardLabelSettingsFromSource({
      source,
      boardLabels,
      globalShowLabels,
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
