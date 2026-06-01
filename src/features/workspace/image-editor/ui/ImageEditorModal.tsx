// src/features/workspace/image-editor/ui/ImageEditorModal.tsx
// store-aware modal orchestration for per-item image editing

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { isEmptyItemLabelOptions } from '@tierlistbuilder/contracts/workspace/board'
import { resolveEffectiveShowLabels } from '~/shared/board-ui/labels/labelSettings'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
  type RatioOption,
} from '~/shared/board-ui/aspectRatio'
import { useGlobalLabelDefaults } from '~/features/platform/preferences/model/useGlobalLabelDefaults'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useBoardAspectRatioPicker } from '~/features/workspace/board-settings/model/aspect-ratio/useBoardAspectRatioPicker'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useAutoCropTrimShadows } from '~/features/workspace/board-settings/model/auto-crop/useAutoCropTrimShadows'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { useAutoCropAfterLabelsChange } from '~/features/workspace/image-editor/model/auto-crop/useAutoCropAfterLabelsChange'
import { useImageEditorAutoCropAll } from '~/features/workspace/image-editor/model/auto-crop/useImageEditorAutoCropAll'
import { useImageEditorItems } from '~/features/workspace/image-editor/model/useImageEditorItems'
import { useBulkAspectRatioForItems } from '~/features/workspace/image-editor/model/labels/useBulkAspectRatioForItems'
import {
  useImageEditorApplyLabelToAll,
  useImageEditorAutoCropAllConfirmation,
  useImageEditorModalKeyboardShortcuts,
  useImageEditorRatioChangeGuard,
} from '~/features/workspace/image-editor/model/useImageEditorModalActions'
import { useImageEditorSelection } from '~/features/workspace/image-editor/model/useImageEditorSelection'
import { useSelectedItemHandlers } from '~/features/workspace/image-editor/model/transform/useSelectedItemHandlers'
import { BoardControlsBar } from '~/features/workspace/image-editor/ui/BoardControlsBar'
import {
  ImageEditorPane,
  type ImageEditorPaneHandle,
} from '~/features/workspace/image-editor/ui/ImageEditorPane'
import { ImageEditorModalDialogs } from '~/features/workspace/image-editor/ui/ImageEditorModalDialogs'
import { ImageEditorRail } from '~/features/workspace/image-editor/ui/ImageEditorRail'
import {
  useImageEditorStore,
  type ImageEditorFilter,
  type ImageEditorMode,
} from '~/features/workspace/image-editor/model/useImageEditorStore'

const NOOP = () =>
{}

export const ImageEditorModal = () =>
{
  const { isOpen, mode } = useImageEditorStore(
    useShallow((s) => ({ isOpen: s.isOpen, mode: s.mode }))
  )
  if (!isOpen) return null
  // remount on mode change so per-pane drafts/refs reset cleanly
  return <ImageEditorModalBody key={mode} mode={mode} />
}

interface ImageEditorModalBodyProps
{
  mode: ImageEditorMode
}

const ImageEditorModalBody = ({ mode }: ImageEditorModalBodyProps) =>
{
  const titleId = useId()
  const isSingleMode = mode === 'single'
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
    boardDefaultFit,
    boardDefaultPadding,
    boardAutoPlate,
    boardLabels,
    setItemTransform,
    setItemsTransform,
    setBoardLabelSettings,
    setBoardAndItemsLabelOptions,
  } = useActiveBoardStore(
    useShallow((s) => ({
      items: s.items,
      tiers: s.tiers,
      unrankedItemIds: s.unrankedItemIds,
      boardDefaultFit: s.defaultItemImageFit,
      boardDefaultPadding: s.defaultItemImagePadding,
      boardAutoPlate: s.autoPlate,
      boardLabels: s.labels,
      setItemTransform: s.setItemTransform,
      setItemsTransform: s.setItemsTransform,
      setBoardLabelSettings: s.setBoardLabelSettings,
      setBoardAndItemsLabelOptions: s.setBoardAndItemsLabelOptions,
    }))
  )
  const boardAspectRatio = useActiveBoardStore(getBoardItemAspectRatio)
  const globalLabelDefaults = useGlobalLabelDefaults()
  const { globalTextStyleId, boardItemSize } = usePreferencesStore(
    useShallow((s) => ({
      globalTextStyleId: s.textStyleId,
      boardItemSize: s.itemSize,
    }))
  )
  const effectiveShowLabels = resolveEffectiveShowLabels(
    boardLabels,
    globalLabelDefaults.showLabels
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
  // The modal owns label-aware measurements for both bulk crop & the active
  // pane, so the pane does not mount its own duplicate hidden tile.
  const singleModeItem =
    isSingleMode && initialItemId ? items[initialItemId] : undefined
  const labelMeasurementItems = useMemo(
    () =>
      isSingleMode ? (singleModeItem ? [singleModeItem] : []) : filteredItems,
    [filteredItems, isSingleMode, singleModeItem]
  )
  const {
    getBoardAspectRatioForItem,
    measurementsReady: bulkMeasurementsReady,
    measurementNodes: bulkMeasurementNodes,
  } = useBulkAspectRatioForItems({
    items: labelMeasurementItems,
    boardAspectRatio,
    itemSize: boardItemSize,
    boardLabels,
    globalLabelDefaults,
  })
  const {
    autoCropProgress,
    autoCropAllApplied,
    cancelAutoCropAll,
    handleAutoCropAll,
    getManualAdjustmentCount,
  } = useImageEditorAutoCropAll({
    filteredItems,
    getBoardAspectRatioForItem,
    trimSoftShadows,
    setItemsTransform,
  })
  const rerunAutoCropAll = useCallback(() =>
  {
    void handleAutoCropAll()
  }, [handleAutoCropAll])
  const handleShowLabelsChange = useAutoCropAfterLabelsChange({
    boardLabels,
    setBoardLabelSettings,
    shouldRerunAutoCrop: autoCropAllApplied || autoCropProgress.running,
    onCancelAutoCrop: cancelAutoCropAll,
    canRunAutoCrop: !autoCropProgress.running && bulkMeasurementsReady,
    onRunAutoCrop: rerunAutoCropAll,
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
  const selectedItem = isSingleMode ? singleModeItem : multiSelectedItem
  const selectedId = isSingleMode
    ? (singleModeItem?.id ?? null)
    : multiSelectedId

  const handleCommit = useCallback(
    (id: ItemId, transform: Parameters<typeof setItemTransform>[1]) =>
    {
      setItemTransform(id, transform)
      if (transform) clearSkipped(id)
    },
    [clearSkipped, setItemTransform]
  )
  const {
    handleSelectedAltTextChange,
    handleSelectedApplyLabelToAll,
    handleSelectedBackgroundColorChange,
    handleSelectedCommit,
    handleSelectedImagePaddingChange,
    handleSelectedLabelChange,
    handleSelectedLabelOptionsChange,
    handleSelectedNotesChange,
  } = useSelectedItemHandlers({
    selectedId,
    onCommit: handleCommit,
    requestApplyLabelToAll,
  })
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

  const paneNavigation = useMemo(
    () =>
      isSingleMode
        ? {
            canNext: false,
            canPrev: false,
            canSkip: false,
            onNext: NOOP,
            onPrev: NOOP,
            onSkip: NOOP,
          }
        : {
            canNext:
              selectedIndex >= 0 && selectedIndex < filteredItems.length - 1,
            canPrev: selectedIndex > 0,
            canSkip:
              selectedIndex >= 0 && selectedIndex < filteredItems.length - 1,
            onNext: goNext,
            onPrev: goPrev,
            onSkip: goSkip,
          },
    [isSingleMode, selectedIndex, filteredItems.length, goNext, goPrev, goSkip]
  )
  const onApplyLabelToAll = isSingleMode ? NOOP : handleSelectedApplyLabelToAll

  useImageEditorModalKeyboardShortcuts({
    flushActivePaneEdit,
    goPrev: paneNavigation.onPrev,
    goNext: paneNavigation.onNext,
    goSkip: paneNavigation.onSkip,
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
      {bulkMeasurementNodes}
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
              boardDefaultPadding={boardDefaultPadding}
              boardAutoPlate={boardAutoPlate}
              trimSoftShadows={trimSoftShadows}
              boardLabels={boardLabels}
              globalLabelDefaults={globalLabelDefaults}
              globalTextStyleId={globalTextStyleId}
              boardItemSize={boardItemSize}
              getBoardAspectRatioForItem={getBoardAspectRatioForItem}
              onCommit={handleSelectedCommit}
              onPaddingCommit={handleSelectedImagePaddingChange}
              onLabelChange={handleSelectedLabelChange}
              onLabelOptionsChange={handleSelectedLabelOptionsChange}
              onApplyLabelToAll={onApplyLabelToAll}
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
              canPrev={paneNavigation.canPrev}
              canNext={paneNavigation.canNext}
              canSkip={paneNavigation.canSkip}
              onPrev={paneNavigation.onPrev}
              onNext={paneNavigation.onNext}
              onSkip={paneNavigation.onSkip}
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
      <ImageEditorModalDialogs
        applyLabel={applyLabel}
        autoCropAll={autoCropAll}
        ratioGuard={ratioGuard}
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
  // Single-mode empty state should be rare. The modal opens w/ an explicit
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
