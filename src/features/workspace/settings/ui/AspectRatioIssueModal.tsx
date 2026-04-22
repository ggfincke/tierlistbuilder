// src/features/workspace/settings/ui/AspectRatioIssueModal.tsx
// first-encounter prompt for mixed aspect ratio items w/ inline ratio picker

import { useCallback, useId, useMemo, useState } from 'react'

import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import type {
  ImageFit,
  TierItem,
} from '@/features/workspace/boards/model/contract'
import type { ItemId } from '@/shared/types/ids'
import {
  findMismatchedItems,
  formatAspectRatio,
  getEffectiveImageFit,
} from '@/features/workspace/boards/lib/aspectRatio'
import { ItemContent } from '@/shared/board-ui/ItemContent'
import { BaseModal } from '@/shared/overlay/BaseModal'
import { SecondaryButton } from '@/shared/ui/SecondaryButton'
import { useAspectRatioPrompt } from '../model/useAspectRatioPrompt'
import { useBoardAspectRatioPicker } from '../model/useBoardAspectRatioPicker'
import { AspectRatioChips, CustomRatioInput } from './AspectRatioPicker'
import { SegmentedControl } from './SegmentedControl'

const MAX_THUMBNAIL_PREVIEW = 4

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
    customOpen,
    handleOption,
    applyCustom,
    canApplyCustom,
  } = useBoardAspectRatioPicker()
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
    if (pendingBulkFit !== null)
    {
      const ids = mismatched.map((item) => item.id)
      setItemsImageFit(ids, pendingBulkFit)
      // pin the board default so later imports inherit the same fit
      setDefaultItemImageFit(pendingBulkFit)
    }
    if (dontAskAgain) setAspectRatioPromptDismissed(true)
  }, [
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

  return (
    <BaseModal
      open
      onClose={close}
      labelledBy={titleId}
      describedBy={descId}
      panelClassName="w-full max-w-lg p-6"
    >
      <h2 id={titleId} className="text-base font-semibold text-[var(--t-text)]">
        Mixed aspect ratios detected
      </h2>
      <p id={descId} className="mt-1.5 text-sm text-[var(--t-text-muted)]">
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
      />

      <AspectRatioChips
        selectedOption={selectedOption}
        onSelect={handleOption}
      />

      {customOpen && (
        <CustomRatioInput
          width={customWidth}
          height={customHeight}
          onWidthChange={setCustomWidth}
          onHeightChange={setCustomHeight}
          onApply={applyCustom}
          canApply={canApplyCustom}
          className="mt-3"
        />
      )}

      {mismatched.length > 0 && (
        <div className="mt-2.5">
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

      <label className="mt-5 flex cursor-pointer items-center gap-2 text-xs text-[var(--t-text-muted)]">
        <input
          type="checkbox"
          checked={dontAskAgain}
          onChange={(e) => setDontAskAgain(e.target.checked)}
          className="focus-custom h-3.5 w-3.5 cursor-pointer accent-[var(--t-accent)]"
        />
        Don&apos;t show again for this board
      </label>

      <div className="mt-5 flex items-center justify-between gap-3">
        {onAdjustEach ? (
          <button
            type="button"
            onClick={handleAdjustEach}
            className="focus-custom rounded text-sm text-[var(--t-text-muted)] transition-colors hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            Adjust each item -&gt;
          </button>
        ) : (
          <span />
        )}
        <SecondaryButton onClick={handleDone} variant="surface">
          Done
        </SecondaryButton>
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
}

const MismatchPreviewStrip = ({
  snapshotIds,
  items,
  mismatchedCount,
  boardAspectRatio,
  boardDefaultFit,
  pendingBulkFit,
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

  return (
    <div className="mt-4 flex items-stretch gap-2">
      {thumbnailItems.map((item) => (
        <div
          key={item.id}
          className="relative min-w-0 max-w-28 flex-1 overflow-hidden rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)]"
          style={{ aspectRatio: boardAspectRatio }}
          title={item.label ?? 'Item'}
        >
          <ItemContent
            item={item}
            fit={pendingBulkFit ?? getEffectiveImageFit(item, boardDefaultFit)}
          />
        </div>
      ))}
      {remaining > 0 && (
        <div
          aria-hidden="true"
          className="flex min-w-0 max-w-28 flex-1 items-center justify-center rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)] text-sm font-medium text-[var(--t-text-muted)]"
          style={{ aspectRatio: boardAspectRatio }}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}
