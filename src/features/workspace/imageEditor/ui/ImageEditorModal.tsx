// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// store-aware modal orchestration for per-item image editing

import { useCallback, useId, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
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
    globalShowLabels,
    setBoardAndItemsLabelOptions,
  })

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

  useImageEditorModalKeyboardShortcuts({
    flushActivePaneEdit,
    goPrev,
    goNext,
    goSkip,
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
        onAutoCropAll={autoCropAll.request}
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
              onApplyLabelToAll={() => applyLabel.request(selectedItem.id)}
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
}

const getEmptyStateMessage = (
  totalCount: number,
  filter: ImageEditorFilter
): string =>
{
  if (totalCount === 0) return 'This board has no image items to adjust yet.'
  if (filter === 'mismatched')
  {
    return 'No items have aspect ratios that differ from the board.'
  }
  if (filter === 'adjusted') return 'No items have manual adjustments yet.'
  return 'No items match this filter.'
}

const EmptyState = ({ totalCount, filter }: EmptyStateProps) => (
  <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--t-text-muted)]">
    {getEmptyStateMessage(totalCount, filter)}
  </div>
)
