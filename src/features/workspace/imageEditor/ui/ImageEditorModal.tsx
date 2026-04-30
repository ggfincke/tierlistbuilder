// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// store-aware modal orchestration for per-item image editing

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { resolveLabelLayout } from '~/shared/board-ui/labelDisplay'
import {
  resolveEffectiveShowLabels,
  withBoardShowLabels,
} from '~/shared/board-ui/labelSettings'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
  type RatioOption,
} from '~/shared/board-ui/aspectRatio'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useBoardAspectRatioPicker } from '~/features/workspace/settings/model/useBoardAspectRatioPicker'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useAutoCropTrimShadows } from '~/features/workspace/settings/model/useAutoCropTrimShadows'
import {
  getUndoRedoShortcut,
  isEditableShortcutTarget,
} from '~/features/workspace/shortcuts/model/undoRedoShortcut'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { toast } from '~/shared/notifications/useToastStore'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import { isInteractiveArrowTarget } from '../lib/imageEditorGeometry'
import type { PendingImageEditorPaneEdit } from '../model/pendingImageEdit'
import { useImageEditorAutoCropAll } from '../model/useImageEditorAutoCropAll'
import { useImageEditorItems } from '../model/useImageEditorItems'
import { useImageEditorSelection } from '../model/useImageEditorSelection'
import { BoardControlsBar } from './BoardControlsBar'
import { ImageEditorPane, type ImageEditorPaneHandle } from './ImageEditorPane'
import { ImageEditorRail } from './ImageEditorRail'
import {
  useImageEditorStore,
  type ImageEditorFilter,
} from '../model/useImageEditorStore'

export const ImageEditorModal = () =>
{
  const isOpen = useImageEditorStore((s) => s.isOpen)
  if (!isOpen) return null
  return <ImageEditorModalBody />
}

const ImageEditorModalBody = () =>
{
  const titleId = useId()
  const { filter, setFilter, initialItemId, close } = useImageEditorStore(
    useShallow((s) => ({
      filter: s.filter,
      setFilter: s.setFilter,
      initialItemId: s.initialItemId,
      close: s.close,
    }))
  )
  const {
    items,
    tiers,
    unrankedItemIds,
    boardAspectRatio,
    setItemTransform,
    setItemsTransform,
    boardDefaultFit,
    boardLabels,
    setBoardLabelSettings,
    setItemLabelOptions,
    setBoardAndItemsLabelOptions,
    setItemLabel,
  } = useActiveBoardStore(
    useShallow((s) => ({
      items: s.items,
      tiers: s.tiers,
      unrankedItemIds: s.unrankedItemIds,
      boardAspectRatio: getBoardItemAspectRatio(s),
      setItemTransform: s.setItemTransform,
      setItemsTransform: s.setItemsTransform,
      boardDefaultFit: s.defaultItemImageFit,
      boardLabels: s.labels,
      setBoardLabelSettings: s.setBoardLabelSettings,
      setItemLabelOptions: s.setItemLabelOptions,
      setBoardAndItemsLabelOptions: s.setBoardAndItemsLabelOptions,
      setItemLabel: s.setItemLabel,
    }))
  )
  const globalShowLabels = usePreferencesStore((s) => s.showLabels)
  const globalTextStyleId = usePreferencesStore((s) => s.textStyleId)
  const boardItemSize = usePreferencesStore((s) => s.itemSize)
  const effectiveShowLabels = resolveEffectiveShowLabels(
    boardLabels,
    globalShowLabels
  )
  const handleShowLabelsChange = useCallback(
    (show: boolean) =>
    {
      setBoardLabelSettings(withBoardShowLabels(boardLabels, show))
    },
    [boardLabels, setBoardLabelSettings]
  )
  const ratioPicker = useBoardAspectRatioPicker()
  const { trimSoftShadows, setTrimSoftShadows } = useAutoCropTrimShadows()
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const activePaneRef = useRef<ImageEditorPaneHandle | null>(null)
  const { allImageItems, filteredItems, getItemsWithPendingEdit } =
    useImageEditorItems({
      items,
      tiers,
      unrankedItemIds,
      filter,
      boardAspectRatio,
    })
  const {
    autoCropProgress,
    autoCropAllApplied,
    handleAutoCropAll,
    getManualAdjustmentCount,
  } = useImageEditorAutoCropAll({
    filteredItems,
    boardAspectRatio,
    trimSoftShadows,
    setItemsTransform,
  })

  const [confirmAutoCropOpen, setConfirmAutoCropOpen] = useState(false)
  const [confirmAutoCropCount, setConfirmAutoCropCount] = useState(0)
  const flushActivePaneEdit = useCallback(() =>
  {
    activePaneRef.current?.flushPendingEdit()
  }, [])

  const [confirmApplyLabelOpen, setConfirmApplyLabelOpen] = useState(false)
  const [pendingApplyLabelSourceId, setPendingApplyLabelSourceId] =
    useState<ItemId | null>(null)
  const [confirmApplyLabelCount, setConfirmApplyLabelCount] = useState(0)

  const [confirmRatioOpen, setConfirmRatioOpen] = useState(false)
  const [pendingRatioAction, setPendingRatioAction] = useState<
    (() => void) | null
  >(null)
  const [confirmRatioCount, setConfirmRatioCount] = useState(0)
  const getBoardWideAdjustedCount = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): number =>
      allImageItems.reduce((n, it) =>
      {
        const transform =
          pendingEdit?.id === it.id
            ? (pendingEdit.transform ?? undefined)
            : it.transform
        return n + (transform && !isIdentityTransform(transform) ? 1 : 0)
      }, 0),
    [allImageItems]
  )
  const guardRatioAction = useCallback(
    (run: () => void) =>
    {
      const pendingEdit = activePaneRef.current?.getPendingEdit() ?? null
      const adjustedCount = getBoardWideAdjustedCount(pendingEdit)
      const runAfterFlush = () =>
      {
        flushActivePaneEdit()
        run()
      }
      if (adjustedCount === 0)
      {
        runAfterFlush()
        return
      }
      setConfirmRatioCount(adjustedCount)
      setPendingRatioAction(() => runAfterFlush)
      setConfirmRatioOpen(true)
    },
    [flushActivePaneEdit, getBoardWideAdjustedCount]
  )

  const handleRatioOption = useCallback(
    (option: RatioOption) =>
    {
      if (option.kind === 'custom')
      {
        ratioPicker.handleOption(option)
        return
      }
      guardRatioAction(() => ratioPicker.handleOption(option))
    },
    [guardRatioAction, ratioPicker]
  )

  const handleApplyCustomRatio = useCallback(() =>
  {
    guardRatioAction(() => ratioPicker.applyCustom())
  }, [guardRatioAction, ratioPicker])

  const confirmRatioChange = useCallback(() =>
  {
    pendingRatioAction?.()
    setPendingRatioAction(null)
    setConfirmRatioCount(0)
    setConfirmRatioOpen(false)
  }, [pendingRatioAction])

  const cancelRatioChange = useCallback(() =>
  {
    setPendingRatioAction(null)
    setConfirmRatioCount(0)
    setConfirmRatioOpen(false)
  }, [])

  const requestAutoCropAll = useCallback(() =>
  {
    const pendingEdit = activePaneRef.current?.getPendingEdit() ?? null
    const adjustmentCount = getManualAdjustmentCount(pendingEdit)
    if (adjustmentCount > 0)
    {
      setConfirmAutoCropCount(adjustmentCount)
      setConfirmAutoCropOpen(true)
      return
    }
    const cropItems = getItemsWithPendingEdit(pendingEdit)
    flushActivePaneEdit()
    void handleAutoCropAll(cropItems)
  }, [
    getItemsWithPendingEdit,
    getManualAdjustmentCount,
    flushActivePaneEdit,
    handleAutoCropAll,
  ])

  const confirmAutoCropAll = useCallback(() =>
  {
    const pendingEdit = activePaneRef.current?.getPendingEdit() ?? null
    const cropItems = getItemsWithPendingEdit(pendingEdit)
    setConfirmAutoCropOpen(false)
    setConfirmAutoCropCount(0)
    flushActivePaneEdit()
    void handleAutoCropAll(cropItems)
  }, [getItemsWithPendingEdit, flushActivePaneEdit, handleAutoCropAll])

  const applyLabelToAllNow = useCallback(
    (sourceId: ItemId) =>
    {
      const source = items[sourceId]
      if (!source) return
      const layout = resolveLabelLayout({
        itemOptions: source.labelOptions,
        boardSettings: boardLabels,
        globalShowLabels,
      })
      const nextBoardLabels: BoardLabelSettings = {
        show: layout.visible,
        placement: layout.placement,
        scrim: layout.scrim,
        fontSizePx: layout.fontSizePx,
        textStyleId: layout.textStyleId,
        ...(layout.textColor !== 'auto' ? { textColor: layout.textColor } : {}),
      }
      const clearEntries = allImageItems
        .filter((it) => !!it.labelOptions)
        .map((it) => ({ id: it.id, options: null }))
      setBoardAndItemsLabelOptions(nextBoardLabels, clearEntries)
    },
    [
      items,
      allImageItems,
      boardLabels,
      globalShowLabels,
      setBoardAndItemsLabelOptions,
    ]
  )

  const countItemsThatWillChange = useCallback(
    (sourceId: ItemId): number =>
    {
      const source = items[sourceId]
      if (!source) return 0
      let count = 0
      for (const it of allImageItems)
      {
        if (it.id === sourceId) continue
        if (it.labelOptions) count += 1
      }
      return count
    },
    [items, allImageItems]
  )

  const requestApplyLabelToAll = useCallback(
    (sourceId: ItemId) =>
    {
      const atRisk = countItemsThatWillChange(sourceId)
      if (atRisk === 0)
      {
        applyLabelToAllNow(sourceId)
        return
      }
      setConfirmApplyLabelCount(atRisk)
      setPendingApplyLabelSourceId(sourceId)
      setConfirmApplyLabelOpen(true)
    },
    [applyLabelToAllNow, countItemsThatWillChange]
  )

  const confirmApplyLabelToAll = useCallback(() =>
  {
    if (pendingApplyLabelSourceId) applyLabelToAllNow(pendingApplyLabelSourceId)
    setPendingApplyLabelSourceId(null)
    setConfirmApplyLabelOpen(false)
    setConfirmApplyLabelCount(0)
  }, [applyLabelToAllNow, pendingApplyLabelSourceId])

  const cancelApplyLabelToAll = useCallback(() =>
  {
    setPendingApplyLabelSourceId(null)
    setConfirmApplyLabelOpen(false)
    setConfirmApplyLabelCount(0)
  }, [])

  const {
    selectedIndex,
    selectedItem,
    selectedId,
    setPickedId,
    goPrev,
    goNext,
    goSkip,
    isSkipped,
    clearSkipped,
  } = useImageEditorSelection({
    initialItemId,
    allImageItems,
    filteredItems,
    filter,
  })

  const handleCommit = useCallback(
    (id: ItemId, transform: Parameters<typeof setItemTransform>[1]) =>
    {
      setItemTransform(id, transform)
      if (transform) clearSkipped(id)
    },
    [clearSkipped, setItemTransform]
  )

  useEffect(() =>
  {
    const onKey = (e: KeyboardEvent) =>
    {
      if (e.defaultPrevented) return

      const undoRedoShortcut = getUndoRedoShortcut(e)

      if (undoRedoShortcut)
      {
        if (isEditableShortcutTarget(e.target)) return
        e.preventDefault()
        flushActivePaneEdit()
        const result =
          undoRedoShortcut === 'undo'
            ? useActiveBoardStore.getState().undo()
            : useActiveBoardStore.getState().redo()
        if (result)
        {
          toast(
            `${undoRedoShortcut === 'undo' ? 'Undid' : 'Redid'} ${result.label.toLowerCase()}`
          )
        }
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInteractiveArrowTarget(e.target)) return
      if (e.key === '[')
      {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === ']')
      {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === 's' || e.key === 'S')
      {
        e.preventDefault()
        goSkip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flushActivePaneEdit, goPrev, goNext, goSkip])

  return (
    <BaseModal
      open
      onClose={close}
      labelledBy={titleId}
      panelClassName="flex flex-col p-0"
      panelStyle={{
        height: 'min(880px, calc(100dvh - 4rem))',
        maxWidth: 'none',
        overflowY: 'hidden',
        width: 'min(1120px, calc(100vw - 4rem))',
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <ModalHeader titleId={titleId}>Adjust items to fit board</ModalHeader>
          {selectedIndex >= 0 && filteredItems.length > 0 && (
            <span
              className="text-xs tabular-nums text-[var(--t-text-faint)]"
              aria-live="polite"
              title={
                filter === 'all'
                  ? 'Position in the full image-item list'
                  : `Position within the "${filter === 'mismatched' ? 'Mismatched' : 'Adjusted'}" filter - switch to All to see every image`
              }
            >
              Item {selectedIndex + 1} of {filteredItems.length}
              {filter !== 'all' && (
                <span className="ml-1 text-[var(--t-text-faint)]">
                  {filter === 'mismatched' ? 'mismatched' : 'adjusted'}
                </span>
              )}
            </span>
          )}
        </div>
        <SecondaryButton
          onClick={close}
          variant="surface"
          size="sm"
          title="Close - all changes are saved automatically"
        >
          Close
        </SecondaryButton>
      </div>
      <BoardControlsBar
        ratioPicker={ratioPicker}
        onRatioOption={handleRatioOption}
        onApplyCustomRatio={handleApplyCustomRatio}
        onAutoCropAll={requestAutoCropAll}
        autoCropProgress={autoCropProgress}
        autoCropAllApplied={autoCropAllApplied}
        trimSoftShadows={trimSoftShadows}
        onTrimSoftShadowsChange={setTrimSoftShadows}
        showLabels={effectiveShowLabels}
        onShowLabelsChange={handleShowLabelsChange}
      />
      <div className="flex min-h-0 flex-1">
        <ImageEditorRail
          filter={filter}
          onFilterChange={setFilter}
          items={filteredItems}
          totalCount={allImageItems.length}
          boardAspectRatio={boardAspectRatio}
          boardDefaultFit={boardDefaultFit}
          boardLabels={boardLabels}
          globalShowLabels={globalShowLabels}
          selectedId={selectedId}
          onSelect={setPickedId}
          isSkipped={isSkipped}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedItem ? (
            <ImageEditorPane
              ref={activePaneRef}
              key={`${selectedItem.id}:${boardAspectRatio}:${getEffectiveImageFit(selectedItem, boardDefaultFit)}`}
              item={selectedItem}
              boardAspectRatio={boardAspectRatio}
              boardDefaultFit={boardDefaultFit}
              trimSoftShadows={trimSoftShadows}
              boardLabels={boardLabels}
              globalShowLabels={globalShowLabels}
              globalTextStyleId={globalTextStyleId}
              boardItemSize={boardItemSize}
              onCommit={(t) => handleCommit(selectedItem.id, t)}
              onLabelChange={(label) => setItemLabel(selectedItem.id, label)}
              onLabelOptionsChange={(opts) =>
                setItemLabelOptions(selectedItem.id, opts)
              }
              onApplyLabelToAll={() => requestApplyLabelToAll(selectedItem.id)}
              canApplyLabelToAll={allImageItems.length > 1}
              labelAppliedToAll={allImageItems.every((it) => !it.labelOptions)}
              applyLabelToAllTitle={
                allImageItems.length > 1
                  ? `Use this item's label settings as the board default and clear per-tile overrides on ${allImageItems.length - 1} other ${
                      allImageItems.length === 2 ? 'item' : 'items'
                    }`
                  : 'No other image items on the board'
              }
              captionExpanded={captionExpanded}
              onCaptionExpandedChange={setCaptionExpanded}
              imageExpanded={imageExpanded}
              onImageExpandedChange={setImageExpanded}
              canPrev={selectedIndex > 0}
              canNext={
                selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
              }
              canSkip={
                selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
              }
              onPrev={goPrev}
              onNext={goNext}
              onSkip={goSkip}
            />
          ) : (
            <EmptyState totalCount={allImageItems.length} filter={filter} />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmAutoCropOpen}
        title="Overwrite image adjustments?"
        description={`Auto-crop will replace ${confirmAutoCropCount === 1 ? '1 saved or pending adjustment' : `${confirmAutoCropCount} saved or pending adjustments`} in this view. Items already auto-cropped or untouched stay as they are.`}
        confirmText="Auto-crop all"
        variant="accent"
        onConfirm={confirmAutoCropAll}
        onCancel={() =>
        {
          setConfirmAutoCropCount(0)
          setConfirmAutoCropOpen(false)
        }}
      />
      <ConfirmDialog
        open={confirmRatioOpen}
        title="Change board ratio?"
        description={`This will reflow every item to the new ratio. ${
          confirmRatioCount === 1
            ? '1 item has a manual crop'
            : `${confirmRatioCount} items have manual crops`
        } that may need re-checking.`}
        confirmText="Change ratio"
        cancelText="Keep current"
        variant="accent"
        onConfirm={confirmRatioChange}
        onCancel={cancelRatioChange}
      />
      <ConfirmDialog
        open={confirmApplyLabelOpen}
        title="Apply label settings to all items?"
        description={`This sets the board default label settings to match this item, and clears per-tile label overrides on ${
          confirmApplyLabelCount === 1
            ? '1 other item'
            : `${confirmApplyLabelCount} other items`
        }. The board's text content stays per-item.`}
        confirmText="Apply to all"
        cancelText="Cancel"
        variant="accent"
        onConfirm={confirmApplyLabelToAll}
        onCancel={cancelApplyLabelToAll}
      />
    </BaseModal>
  )
}

interface EmptyStateProps
{
  totalCount: number
  filter: ImageEditorFilter
}

const EmptyState = ({ totalCount, filter }: EmptyStateProps) =>
{
  const message =
    totalCount === 0
      ? 'This board has no image items to adjust yet.'
      : filter === 'mismatched'
        ? 'No items have aspect ratios that differ from the board.'
        : filter === 'adjusted'
          ? 'No items have manual adjustments yet.'
          : 'No items match this filter.'

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--t-text-muted)]">
      {message}
    </div>
  )
}
