// src/features/workspace/settings/ui/AspectRatioIssueModal.tsx
// first-encounter prompt for mixed aspect ratio items w/ inline ratio picker

import { ChevronRight } from 'lucide-react'
import { useCallback, useId, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  ItemShape,
  ItemSize,
} from '@tierlistbuilder/contracts/workspace/settings'
import {
  computeAutoBoardAspectRatio,
  findMismatchedItems,
  formatAspectRatio,
  getEffectiveImageFit,
} from '~/features/workspace/boards/lib/aspectRatio'
import {
  ITEM_LONG_EDGE_PX,
  itemSlotDimensions,
  SHAPE_CLASS,
} from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { BaseModal, ModalHeader } from '~/shared/overlay/Modal'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { useSettingsStore } from '../model/useSettingsStore'
import { useAspectRatioPrompt } from '../model/useAspectRatioPrompt'
import { useDeferredAspectRatioPicker } from '../model/useDeferredAspectRatioPicker'
import { AspectRatioTiles } from './AspectRatioTiles'
import { SegmentedControl } from './SegmentedControl'

const MAX_THUMBNAIL_PREVIEW = 4

// extra room beyond the tile strip — padding + a small breathing margin; keeps
// the modal wide enough that chips/footer don't feel cramped next to the tiles
const MODAL_CHROME_PX = 80

interface AspectRatioIssueModalProps
{
  onAdjustEach?: () => void
}

// outer wrapper — gates on isOpen so the body unmounts (& its local state
// resets) whenever the modal closes, instead of doing reset-in-effect
export const AspectRatioIssueModal = ({
  onAdjustEach,
}: AspectRatioIssueModalProps) =>
{
  const { isOpen } = useAspectRatioPrompt()
  if (!isOpen) return null
  return <AspectRatioIssueModalBody onAdjustEach={onAdjustEach} />
}

const AspectRatioIssueModalBody = ({
  onAdjustEach,
}: AspectRatioIssueModalProps) =>
{
  const { close } = useAspectRatioPrompt()
  const titleId = useId()
  const descId = useId()

  const {
    boardAspectRatio,
    selectedOption,
    customWidth,
    customHeight,
    setCustomWidth,
    setCustomHeight,
    handleOption,
    applyCustom,
    canApplyCustom,
    commit: commitPicker,
  } = useDeferredAspectRatioPicker()
  const items = useActiveBoardStore((state) => state.items)
  const setItemsImageFit = useActiveBoardStore(
    (state) => state.setItemsImageFit
  )
  const setAspectRatioPromptDismissed = useActiveBoardStore(
    (state) => state.setAspectRatioPromptDismissed
  )
  const boardDefaultFit = useActiveBoardStore(
    (state) => state.defaultItemImageFit
  )
  const setDefaultItemImageFit = useActiveBoardStore(
    (state) => state.setDefaultItemImageFit
  )
  const { itemSize, itemShape } = useSettingsStore(
    useShallow((state) => ({
      itemSize: state.itemSize,
      itemShape: state.itemShape,
    }))
  )
  // ratio that Auto would resolve to based on current items; feeds the Auto
  // tile's preview rect so it shows what picking Auto would actually do
  const autoRatio = useActiveBoardStore(
    (state) => computeAutoBoardAspectRatio(state) ?? undefined
  )

  const mismatched = useMemo<TierItem[]>(
    () => findMismatchedItems({ items, itemAspectRatio: boardAspectRatio }),
    [items, boardAspectRatio]
  )

  // bulk fit stays a local preview until the user commits via Done / Adjust
  // each — avoids polluting undo history when the user cycles fits
  const [pendingBulkFit, setPendingBulkFit] = useState<ImageFit | null>(null)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const commitPending = useCallback(() =>
  {
    // commit the pending ratio/mode first so downstream auto-derivations see
    // the user's choice before we apply bulk fit to the mismatched items
    commitPicker()
    if (pendingBulkFit !== null)
    {
      const ids = mismatched.map((item) => item.id)
      setItemsImageFit(ids, pendingBulkFit)
      // pin the board default so later imports inherit the same fit
      setDefaultItemImageFit(pendingBulkFit)
    }
    if (dontAskAgain) setAspectRatioPromptDismissed(true)
  }, [
    commitPicker,
    pendingBulkFit,
    mismatched,
    setItemsImageFit,
    setDefaultItemImageFit,
    dontAskAgain,
    setAspectRatioPromptDismissed,
  ])

  const handleDone = useCallback(() =>
  {
    commitPending()
    close()
  }, [commitPending, close])

  const handleAdjustEach = useCallback(() =>
  {
    commitPending()
    close()
    onAdjustEach?.()
  }, [commitPending, close, onAdjustEach])

  // snapshot the mismatched item ids once when this body mounts (i.e. on open)
  // so preview tiles stay stable as the user cycles ratios; only shape reshapes
  const [snapshotIds] = useState<readonly ItemId[]>(() =>
    mismatched.map((item) => item.id)
  )

  const ratioLabel = formatAspectRatio(boardAspectRatio)

  // outer slot matches the board's configured item long edge, so preview tiles
  // render at the same scale as the actual tier items behind the modal
  const slotBound = ITEM_LONG_EDGE_PX[itemSize]
  const slotCount = MAX_THUMBNAIL_PREVIEW + 1
  const stripWidth = slotBound * slotCount + 8 * (slotCount - 1)
  // floor at the old max-w-lg so small items don't collapse the modal
  const panelMaxWidth = Math.max(stripWidth + MODAL_CHROME_PX, 512)

  return (
    <BaseModal
      open
      onClose={close}
      labelledBy={titleId}
      describedBy={descId}
      panelClassName="w-full p-6"
      panelStyle={{ maxWidth: panelMaxWidth }}
    >
      <ModalHeader titleId={titleId}>Mixed aspect ratios detected</ModalHeader>
      <p id={descId} className="mt-2 text-sm text-[var(--t-text-muted)]">
        {mismatched.length} item{mismatched.length === 1 ? '' : 's'} don&apos;t
        match the <span className="text-[var(--t-text)]">{ratioLabel}</span>{' '}
        board ratio. Pick a different one, or dismiss to override items
        individually.
      </p>

      <MismatchPreviewStrip
        snapshotIds={snapshotIds}
        items={items}
        mismatchedCount={mismatched.length}
        boardAspectRatio={boardAspectRatio}
        boardDefaultFit={boardDefaultFit}
        pendingBulkFit={pendingBulkFit}
        slotBound={slotBound}
        itemSize={itemSize}
        itemShape={itemShape}
      />

      <div className="mt-5">
        <AspectRatioTiles
          selectedOption={selectedOption}
          onSelect={handleOption}
          customWidth={customWidth}
          customHeight={customHeight}
          onCustomWidthChange={setCustomWidth}
          onCustomHeightChange={setCustomHeight}
          onApplyCustom={applyCustom}
          canApplyCustom={canApplyCustom}
          autoRatio={autoRatio}
        />
      </div>

      {mismatched.length > 0 && (
        <div className="mt-4">
          <SegmentedControl<ImageFit>
            ariaLabel="Bulk image fit"
            options={[
              { value: 'cover', label: 'Cover all' },
              { value: 'contain', label: 'Contain all' },
            ]}
            value={pendingBulkFit ?? boardDefaultFit ?? 'cover'}
            onChange={setPendingBulkFit}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--t-border-secondary)] pt-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--t-text-muted)] transition-colors hover:text-[var(--t-text-secondary)]">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="focus-custom h-3.5 w-3.5 cursor-pointer accent-[var(--t-accent)]"
          />
          Don&apos;t show again
        </label>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {onAdjustEach && (
            <button
              type="button"
              onClick={handleAdjustEach}
              className="focus-custom inline-flex items-center gap-1 rounded text-sm text-[var(--t-text-muted)] transition-colors hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              Adjust each item
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}
          <SecondaryButton onClick={handleDone} variant="surface">
            Done
          </SecondaryButton>
        </div>
      </div>
    </BaseModal>
  )
}

interface MismatchPreviewStripProps
{
  snapshotIds: readonly ItemId[]
  items: Record<ItemId, TierItem>
  mismatchedCount: number
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  pendingBulkFit: ImageFit | null
  slotBound: number
  itemSize: ItemSize
  itemShape: ItemShape
}

const MismatchPreviewStrip = ({
  snapshotIds,
  items,
  mismatchedCount,
  boardAspectRatio,
  boardDefaultFit,
  pendingBulkFit,
  slotBound,
  itemSize,
  itemShape,
}: MismatchPreviewStripProps) =>
{
  const previewItems = useMemo<TierItem[]>(
    () =>
      snapshotIds
        .map((id) => items[id])
        .filter((item): item is TierItem => !!item),
    [snapshotIds, items]
  )
  const thumbnailItems = previewItems.slice(0, MAX_THUMBNAIL_PREVIEW)
  const remaining = Math.max(0, mismatchedCount - thumbnailItems.length)
  if (thumbnailItems.length === 0) return null

  const innerSize = itemSlotDimensions(itemSize, boardAspectRatio)
  const slotStyle = { width: slotBound, height: slotBound }
  const shapeClass = SHAPE_CLASS[itemShape]

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {thumbnailItems.map((item) => (
        <div
          key={item.id}
          className="flex shrink-0 items-center justify-center"
          style={slotStyle}
          title={item.label ?? 'Item'}
        >
          <div
            className={`relative overflow-hidden ${shapeClass}`}
            style={innerSize}
          >
            <ItemContent
              item={item}
              fit={
                pendingBulkFit ?? getEffectiveImageFit(item, boardDefaultFit)
              }
            />
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center"
          style={slotStyle}
        >
          <div
            className={`flex items-center justify-center overflow-hidden border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)] text-sm font-medium text-[var(--t-text-muted)] ${shapeClass}`}
            style={innerSize}
          >
            +{remaining}
          </div>
        </div>
      )}
    </div>
  )
}
