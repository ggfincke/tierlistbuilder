// src/features/workspace/imageEditor/model/useImageEditorModalActions.ts
// modal confirmation gates & keyboard orchestration for image-editor workflows

import { useCallback, useEffect } from 'react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { getImageEditorNavShortcut } from '~/features/workspace/shortcuts/model/imageEditorShortcuts'
import { runUndoRedoShortcut } from '~/features/workspace/shortcuts/model/undoRedoShortcut'
import {
  useConfirmationGate,
  type ConfirmationGate,
} from '~/features/workspace/imageEditor/model/useConfirmationGate'
import { isInteractiveArrowTarget } from '../lib/imageEditorGeometry'
import {
  countAdjustedImageEditorItems,
  countLabelOverridesAffected,
  createApplyLabelToAllPlan,
  type LabelOptionsClearEntry,
} from './imageEditorModalPlans'
import type { PendingImageEditorPaneEdit } from './pendingImageEdit'

interface UseRatioChangeGuardInput
{
  allImageItems: readonly TierItem[]
  getPendingEdit: () => PendingImageEditorPaneEdit | null
  flushActivePaneEdit: () => void
}

interface UseAutoCropAllConfirmationInput
{
  getPendingEdit: () => PendingImageEditorPaneEdit | null
  getItemsWithPendingEdit: (
    pendingEdit: PendingImageEditorPaneEdit | null
  ) => readonly TierItem[]
  getManualAdjustmentCount: (
    pendingEdit: PendingImageEditorPaneEdit | null
  ) => number
  flushActivePaneEdit: () => void
  handleAutoCropAll: (sourceItems?: readonly TierItem[]) => Promise<void>
}

interface UseApplyLabelToAllInput
{
  items: Readonly<Record<ItemId, TierItem>>
  allImageItems: readonly TierItem[]
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
  setBoardAndItemsLabelOptions: (
    settings: BoardLabelSettings | null,
    entries: readonly LabelOptionsClearEntry[]
  ) => void
}

interface UseModalKeyboardShortcutsInput
{
  flushActivePaneEdit: () => void
  goPrev: () => void
  goNext: () => void
  goSkip: () => void
}

export type GateProjection = Pick<
  ConfirmationGate,
  'open' | 'count' | 'confirm' | 'cancel'
>

interface RatioChangeGuard extends GateProjection
{
  request: (run: () => void) => void
}

interface AutoCropAllConfirmation extends GateProjection
{
  request: () => void
}

interface ApplyLabelToAllConfirmation extends GateProjection
{
  request: (sourceId: ItemId) => void
}

const projectGate = (gate: ConfirmationGate): GateProjection => ({
  open: gate.open,
  count: gate.count,
  confirm: gate.confirm,
  cancel: gate.cancel,
})

export const useImageEditorRatioChangeGuard = ({
  allImageItems,
  getPendingEdit,
  flushActivePaneEdit,
}: UseRatioChangeGuardInput): RatioChangeGuard =>
{
  const gate = useConfirmationGate()

  const request = useCallback(
    (run: () => void) =>
    {
      const pendingEdit = getPendingEdit()
      const count = countAdjustedImageEditorItems(allImageItems, pendingEdit)
      gate.request({
        count,
        run: () =>
        {
          flushActivePaneEdit()
          run()
        },
      })
    },
    [allImageItems, flushActivePaneEdit, gate, getPendingEdit]
  )

  return { request, ...projectGate(gate) }
}

export const useImageEditorAutoCropAllConfirmation = ({
  getPendingEdit,
  getItemsWithPendingEdit,
  getManualAdjustmentCount,
  flushActivePaneEdit,
  handleAutoCropAll,
}: UseAutoCropAllConfirmationInput): AutoCropAllConfirmation =>
{
  const gate = useConfirmationGate()

  const runAutoCropAll = useCallback(() =>
  {
    const cropItems = getItemsWithPendingEdit(getPendingEdit())
    flushActivePaneEdit()
    void handleAutoCropAll(cropItems)
  }, [
    flushActivePaneEdit,
    getItemsWithPendingEdit,
    getPendingEdit,
    handleAutoCropAll,
  ])

  const request = useCallback(() =>
  {
    const count = getManualAdjustmentCount(getPendingEdit())
    gate.request({ count, run: runAutoCropAll })
  }, [gate, getManualAdjustmentCount, getPendingEdit, runAutoCropAll])

  return { request, ...projectGate(gate) }
}

export const useImageEditorApplyLabelToAll = ({
  items,
  allImageItems,
  boardLabels,
  globalLabelDefaults,
  setBoardAndItemsLabelOptions,
}: UseApplyLabelToAllInput): ApplyLabelToAllConfirmation =>
{
  const gate = useConfirmationGate()

  const applyLabelToAllNow = useCallback(
    (sourceId: ItemId) =>
    {
      const plan = createApplyLabelToAllPlan({
        sourceId,
        items,
        allImageItems,
        boardLabels,
        globalLabelDefaults,
      })
      if (!plan) return
      setBoardAndItemsLabelOptions(plan.settings, plan.clearEntries)
    },
    [
      allImageItems,
      boardLabels,
      globalLabelDefaults,
      items,
      setBoardAndItemsLabelOptions,
    ]
  )

  const request = useCallback(
    (sourceId: ItemId) =>
    {
      const count = countLabelOverridesAffected(sourceId, items, allImageItems)
      gate.request({
        count,
        run: () => applyLabelToAllNow(sourceId),
      })
    },
    [allImageItems, applyLabelToAllNow, gate, items]
  )

  return { request, ...projectGate(gate) }
}

export const useImageEditorModalKeyboardShortcuts = ({
  flushActivePaneEdit,
  goPrev,
  goNext,
  goSkip,
}: UseModalKeyboardShortcutsInput): void =>
{
  useEffect(() =>
  {
    const onKey = (event: KeyboardEvent) =>
    {
      if (event.defaultPrevented) return

      if (runUndoRedoShortcut(event, { beforeRun: flushActivePaneEdit })) return

      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isInteractiveArrowTarget(event.target)) return

      const navShortcut = getImageEditorNavShortcut(event)
      if (!navShortcut) return
      event.preventDefault()
      if (navShortcut === 'prev') goPrev()
      else if (navShortcut === 'next') goNext()
      else if (navShortcut === 'skip') goSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flushActivePaneEdit, goNext, goPrev, goSkip])
}
