// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// store-aware modal orchestration for per-item image editing

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  isEmptyItemLabelOptions,
  type GlobalLabelDefaults,
} from '@tierlistbuilder/contracts/workspace/board'
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
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { useImageEditorAutoCropAll } from '../model/useImageEditorAutoCropAll'
import { useImageEditorItems } from '../model/useImageEditorItems'
import {
  useImageEditorApplyLabelToAll,
  useImageEditorAutoCropAllConfirmation,
  useImageEditorModalKeyboardShortcuts,
  useImageEditorRatioChangeGuard,
} from '../model/useImageEditorModalActions'
import { useImageEditorSelection } from '../model/useImageEditorSelection'
import { BoardControlsBar } from './BoardControlsBar'
import { ImageEditorPane, type ImageEditorPaneHandle } from './ImageEditorPane'
import { ImageEditorRail } from './ImageEditorRail'
import {
  useImageEditorStore,
  type ImageEditorFilter,
} from '../model/useImageEditorStore'

const NOOP = () =>
{
  /* placeholder for multi-mode handlers when in single mode */
}

export const ImageEditorModal = () =>
{
  const isOpen = useImageEditorStore((s) => s.isOpen)
  if (!isOpen) return null
  return <ImageEditorModalBody />
}

const ImageEditorModalBody = () =>
{
  const titleId = useId()
  const { mode, filter, setFilter, initialItemId, close } = useImageEditorStore(
    useShallow((s) => ({
      mode: s.mode,
      filter: s.filter,
      setFilter: s.setFilter,
      initialItemId: s.initialItemId,
      close: s.close,
    }))
  )
  const isSingleMode = mode === 'single'
  const { items, tiers, unrankedItemIds } = useActiveBoardStore(
    useShallow((s) => ({
      items: s.items,
      tiers: s.tiers,
      unrankedItemIds: s.unrankedItemIds,
    }))
  )
  const boardAspectRatio = useActiveBoardStore(getBoardItemAspectRatio)
  const { boardDefaultFit, boardLabels } = useActiveBoardStore(
    useShallow((s) => ({
      boardDefaultFit: s.defaultItemImageFit,
      boardLabels: s.labels,
    }))
  )
  const {
    setItemTransform,
    setItemsTransform,
    setBoardLabelSettings,
    setItemLabelOptions,
    setBoardAndItemsLabelOptions,
    setItemLabel,
    setItemAltText,
    setItemNotes,
    setItemBackgroundColor,
  } = useActiveBoardStore(
    useShallow((s) => ({
      setItemTransform: s.setItemTransform,
      setItemsTransform: s.setItemsTransform,
      setBoardLabelSettings: s.setBoardLabelSettings,
      setItemLabelOptions: s.setItemLabelOptions,
      setBoardAndItemsLabelOptions: s.setBoardAndItemsLabelOptions,
      setItemLabel: s.setItemLabel,
      setItemAltText: s.setItemAltText,
      setItemNotes: s.setItemNotes,
      setItemBackgroundColor: s.setItemBackgroundColor,
    }))
  )
  const globalShowLabels = usePreferencesStore((s) => s.showLabels)
  const globalLabelPlacementMode = usePreferencesStore(
    (s) => s.defaultLabelPlacementMode
  )
  const globalLabelFontSizePx = usePreferencesStore(
    (s) => s.defaultLabelFontSizePx
  )
  const globalLabelDefaults = useMemo<GlobalLabelDefaults>(
    () => ({
      showLabels: globalShowLabels,
      placementMode: globalLabelPlacementMode,
      fontSizePx: globalLabelFontSizePx,
    }),
    [globalShowLabels, globalLabelPlacementMode, globalLabelFontSizePx]
  )
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

  const getActivePendingEdit = useCallback(
    () => activePaneRef.current?.getPendingEdit() ?? null,
    []
  )
  const flushActivePaneEdit = useCallback(() =>
  {
    activePaneRef.current?.flushPendingEdit()
  }, [])
  const ratioGuard = useImageEditorRatioChangeGuard({
    allImageItems,
    getPendingEdit: getActivePendingEdit,
    flushActivePaneEdit,
  })

  const handleRatioOption = useCallback(
    (option: RatioOption) =>
    {
      if (option.kind === 'custom')
      {
        ratioPicker.handleOption(option)
        return
      }
      ratioGuard.request(() => ratioPicker.handleOption(option))
    },
    [ratioGuard, ratioPicker]
  )

  const handleApplyCustomRatio = useCallback(() =>
  {
    ratioGuard.request(() => ratioPicker.applyCustom())
  }, [ratioGuard, ratioPicker])

  const autoCropAll = useImageEditorAutoCropAllConfirmation({
    getPendingEdit: getActivePendingEdit,
    getItemsWithPendingEdit,
    getManualAdjustmentCount,
    flushActivePaneEdit,
    handleAutoCropAll,
  })
  const applyLabel = useImageEditorApplyLabelToAll({
    items,
    allImageItems,
    boardLabels,
    globalLabelDefaults,
    setBoardAndItemsLabelOptions,
  })
  const requestApplyLabelToAll = applyLabel.request

  const {
    selectedIndex,
    selectedItem: multiSelectedItem,
    selectedId: multiSelectedId,
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

  // single-mode bypasses the rail-driven selection so text-only items (which
  // useImageEditorItems excludes by design) still resolve through to the pane
  const singleModeItem = isSingleMode && initialItemId ? items[initialItemId] : undefined
  const selectedItem = isSingleMode ? singleModeItem : multiSelectedItem
  const selectedId = isSingleMode ? (singleModeItem?.id ?? null) : multiSelectedId

  const handleCommit = useCallback(
    (id: ItemId, transform: Parameters<typeof setItemTransform>[1]) =>
    {
      setItemTransform(id, transform)
      if (transform) clearSkipped(id)
    },
    [clearSkipped, setItemTransform]
  )
  const handleSelectedCommit = useCallback(
    (transform: Parameters<typeof setItemTransform>[1]) =>
    {
      if (!selectedId) return
      handleCommit(selectedId, transform)
    },
    [handleCommit, selectedId]
  )
  const handleSelectedLabelChange = useCallback(
    (label: string) =>
    {
      if (!selectedId) return
      setItemLabel(selectedId, label)
    },
    [selectedId, setItemLabel]
  )
  const handleSelectedAltTextChange = useCallback(
    (value: string) =>
    {
      if (!selectedId) return
      setItemAltText(selectedId, value)
    },
    [selectedId, setItemAltText]
  )
  const handleSelectedNotesChange = useCallback(
    (value: string) =>
    {
      if (!selectedId) return
      setItemNotes(selectedId, value)
    },
    [selectedId, setItemNotes]
  )
  const handleSelectedBackgroundColorChange = useCallback(
    (value: string | null) =>
    {
      if (!selectedId) return
      setItemBackgroundColor(selectedId, value)
    },
    [selectedId, setItemBackgroundColor]
  )
  const handleSelectedLabelOptionsChange = useCallback(
    (options: Parameters<typeof setItemLabelOptions>[1]) =>
    {
      if (!selectedId) return
      setItemLabelOptions(selectedId, options)
    },
    [selectedId, setItemLabelOptions]
  )
  const handleApplySelectedLabelToAll = useCallback(() =>
  {
    if (!selectedId) return
    requestApplyLabelToAll(selectedId)
  }, [requestApplyLabelToAll, selectedId])
  const labelAppliedToAll = useMemo(
    () => allImageItems.every((it) => isEmptyItemLabelOptions(it.labelOptions)),
    [allImageItems]
  )
  const applyLabelToAllTitle = useMemo(() =>
  {
    if (allImageItems.length <= 1) return 'No other image items on the board'
    const otherCount = allImageItems.length - 1
    return `Use this item's label settings as the board default and clear per-tile overrides on ${otherCount} other ${
      otherCount === 1 ? 'item' : 'items'
    }`
  }, [allImageItems.length])

  useImageEditorModalKeyboardShortcuts({
    flushActivePaneEdit,
    // single-mode pins to one item; Left/Right shouldn't shift the hidden
    // multi-mode selection underneath, so feed the hook NOOPs there
    goPrev: isSingleMode ? NOOP : goPrev,
    goNext: isSingleMode ? NOOP : goNext,
    goSkip: isSingleMode ? NOOP : goSkip,
  })

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
          <ModalHeader titleId={titleId}>
            {isSingleMode ? 'Edit item' : 'Adjust items to fit board'}
          </ModalHeader>
          {!isSingleMode && selectedIndex >= 0 && filteredItems.length > 0 && (
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
      {!isSingleMode && (
        <BoardControlsBar
          ratioPicker={ratioPicker}
          onRatioOption={handleRatioOption}
          onApplyCustomRatio={handleApplyCustomRatio}
          onAutoCropAll={autoCropAll.request}
          autoCropProgress={autoCropProgress}
          autoCropAllApplied={autoCropAllApplied}
          trimSoftShadows={trimSoftShadows}
          onTrimSoftShadowsChange={setTrimSoftShadows}
          showLabels={effectiveShowLabels}
          onShowLabelsChange={handleShowLabelsChange}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {!isSingleMode && (
          <ImageEditorRail
            filter={filter}
            onFilterChange={setFilter}
            items={filteredItems}
            totalCount={allImageItems.length}
            boardAspectRatio={boardAspectRatio}
            boardDefaultFit={boardDefaultFit}
            boardLabels={boardLabels}
            globalLabelDefaults={globalLabelDefaults}
            selectedId={selectedId}
            onSelect={setPickedId}
            isSkipped={isSkipped}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {selectedItem ? (
            <ImageEditorPane
              ref={activePaneRef}
              key={`${selectedItem.id}:${boardAspectRatio}:${getEffectiveImageFit(selectedItem, boardDefaultFit)}`}
              item={selectedItem}
              mode={mode}
              boardAspectRatio={boardAspectRatio}
              boardDefaultFit={boardDefaultFit}
              trimSoftShadows={trimSoftShadows}
              boardLabels={boardLabels}
              globalLabelDefaults={globalLabelDefaults}
              globalTextStyleId={globalTextStyleId}
              boardItemSize={boardItemSize}
              onCommit={handleSelectedCommit}
              onLabelChange={handleSelectedLabelChange}
              onLabelOptionsChange={handleSelectedLabelOptionsChange}
              onApplyLabelToAll={
                isSingleMode ? NOOP : handleApplySelectedLabelToAll
              }
              canApplyLabelToAll={!isSingleMode && allImageItems.length > 1}
              labelAppliedToAll={labelAppliedToAll}
              applyLabelToAllTitle={applyLabelToAllTitle}
              captionExpanded={captionExpanded}
              onCaptionExpandedChange={setCaptionExpanded}
              imageExpanded={imageExpanded}
              onImageExpandedChange={setImageExpanded}
              onAltTextChange={handleSelectedAltTextChange}
              onNotesChange={handleSelectedNotesChange}
              onBackgroundColorChange={handleSelectedBackgroundColorChange}
              canPrev={!isSingleMode && selectedIndex > 0}
              canNext={
                !isSingleMode &&
                selectedIndex >= 0 &&
                selectedIndex < filteredItems.length - 1
              }
              canSkip={
                !isSingleMode &&
                selectedIndex >= 0 &&
                selectedIndex < filteredItems.length - 1
              }
              onPrev={isSingleMode ? NOOP : goPrev}
              onNext={isSingleMode ? NOOP : goNext}
              onSkip={isSingleMode ? NOOP : goSkip}
            />
          ) : (
            <EmptyState
              totalCount={allImageItems.length}
              filter={filter}
              isSingleMode={isSingleMode}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={autoCropAll.open}
        title="Overwrite image adjustments?"
        description={`Auto-crop will replace ${autoCropAll.count === 1 ? '1 saved or pending adjustment' : `${autoCropAll.count} saved or pending adjustments`} in this view. Items already auto-cropped or untouched stay as they are.`}
        confirmText="Auto-crop all"
        variant="accent"
        onConfirm={autoCropAll.confirm}
        onCancel={autoCropAll.cancel}
      />
      <ConfirmDialog
        open={ratioGuard.open}
        title="Change board ratio?"
        description={`This will reflow every item to the new ratio. ${
          ratioGuard.count === 1
            ? '1 item has a manual crop'
            : `${ratioGuard.count} items have manual crops`
        } that may need re-checking.`}
        confirmText="Change ratio"
        cancelText="Keep current"
        variant="accent"
        onConfirm={ratioGuard.confirm}
        onCancel={ratioGuard.cancel}
      />
      <ConfirmDialog
        open={applyLabel.open}
        title="Apply label settings to all items?"
        description={`This sets the board default label settings to match this item, and clears per-tile label overrides on ${
          applyLabel.count === 1
            ? '1 other item'
            : `${applyLabel.count} other items`
        }. The board's text content stays per-item.`}
        confirmText="Apply to all"
        cancelText="Cancel"
        variant="accent"
        onConfirm={applyLabel.confirm}
        onCancel={applyLabel.cancel}
      />
    </BaseModal>
  )
}

interface EmptyStateProps
{
  totalCount: number
  filter: ImageEditorFilter
  isSingleMode: boolean
}

const getEmptyStateMessage = (
  totalCount: number,
  filter: ImageEditorFilter,
  isSingleMode: boolean
): string =>
{
  // single-mode empty state should be rare — the modal opens w/ an explicit
  // itemId, so this only fires if the item was removed mid-edit
  if (isSingleMode) return 'This item is no longer on the board.'
  if (totalCount === 0) return 'This board has no image items to adjust yet.'
  if (filter === 'mismatched')
  {
    return 'No items have aspect ratios that differ from the board.'
  }
  if (filter === 'adjusted') return 'No items have manual adjustments yet.'
  return 'No items match this filter.'
}

const EmptyState = ({ totalCount, filter, isSingleMode }: EmptyStateProps) => (
  <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--t-text-muted)]">
    {getEmptyStateMessage(totalCount, filter, isSingleMode)}
  </div>
)
