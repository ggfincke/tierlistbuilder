// src/features/workspace/settings/ui/AspectRatioIssueModal.tsx
// first-encounter prompt for mixed aspect ratio items w/ inline ratio picker

import { Check, ChevronRight, Crop, Loader2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  ItemShape,
  ItemSize,
} from '@tierlistbuilder/contracts/workspace/settings'
import {
  formatAspectRatio,
  getEffectiveImageFit,
} from '~/features/workspace/boards/lib/aspectRatio'
import {
  ITEM_LONG_EDGE_PX,
  itemSlotDimensions,
  SHAPE_CLASS,
} from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import {
  resolveEffectiveShowLabels,
  withBoardShowLabels,
} from '~/shared/board-ui/labelSettings'
import {
  areCachedAutoCropsApplied,
  collectAutoCropTransforms,
  getAutoCropCacheVersion,
  getAutoCropHash,
  subscribeAutoCropCache,
} from '~/shared/lib/autoCrop'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { useSettingsStore } from '../model/useSettingsStore'
import { useAspectRatioPrompt } from '../model/useAspectRatioPrompt'
import { useAutoCropTrimShadows } from '../model/useAutoCropTrimShadows'
import {
  createAspectRatioPromptSnapshot,
  resolveAspectRatioPromptItems,
} from '../model/aspectRatioPromptSnapshot'
import { useDeferredAspectRatioPicker } from '../model/useDeferredAspectRatioPicker'
import { AspectRatioTiles } from './AspectRatioTiles'
import { SegmentedControl } from './SegmentedControl'
import { ShowLabelsToggle } from './ShowLabelsToggle'

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
    autoRatio,
    commit: commitPicker,
  } = useDeferredAspectRatioPicker()
  const {
    items,
    setItemsImageFit,
    setItemsTransform,
    setAspectRatioPromptDismissed,
    boardDefaultFit,
    setDefaultItemImageFit,
    boardLabels,
    setBoardLabelSettings,
  } = useActiveBoardStore(
    useShallow((state) => ({
      items: state.items,
      setItemsImageFit: state.setItemsImageFit,
      setItemsTransform: state.setItemsTransform,
      setAspectRatioPromptDismissed: state.setAspectRatioPromptDismissed,
      boardDefaultFit: state.defaultItemImageFit,
      setDefaultItemImageFit: state.setDefaultItemImageFit,
      boardLabels: state.labels,
      setBoardLabelSettings: state.setBoardLabelSettings,
    }))
  )
  const { itemSize, itemShape, globalShowLabels } = useSettingsStore(
    useShallow((state) => ({
      itemSize: state.itemSize,
      itemShape: state.itemShape,
      globalShowLabels: state.showLabels,
    }))
  )
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
  // alert reads the global trim setting but doesn't expose the toggle here —
  // the editor has it where users are already engaged w/ per-item tuning
  const { trimSoftShadows } = useAutoCropTrimShadows()

  // capture the opening mismatch set; the blocking prompt resolves later
  // previews/actions only against these ids
  const [promptSnapshot] = useState(() =>
    createAspectRatioPromptSnapshot({
      items,
      itemAspectRatio: boardAspectRatio,
    })
  )

  const mismatched = useMemo<TierItem[]>(
    () =>
      resolveAspectRatioPromptItems(promptSnapshot, {
        items,
        itemAspectRatio: boardAspectRatio,
      }),
    [items, boardAspectRatio, promptSnapshot]
  )

  const autoCropTargets = useMemo(
    () => mismatched.filter((item) => !!getAutoCropHash(item)),
    [mismatched]
  )

  // bulk fit stays a local preview until the user commits via Done / Adjust
  // each — avoids polluting undo history when the user cycles fits
  const [pendingBulkFit, setPendingBulkFit] = useState<ImageFit | null>(() =>
    mismatched.length > 0 && autoCropTargets.length === 0 ? 'cover' : null
  )
  const [shouldAutoCropOnOpen] = useState(() => autoCropTargets.length > 0)
  const [autoCropHandledOnOpen, setAutoCropHandledOnOpen] = useState(
    () => !shouldAutoCropOnOpen
  )
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [autoCropProgress, setAutoCropProgress] = useState<{
    running: boolean
    done: number
    total: number
  }>({ running: false, done: 0, total: 0 })
  const autoCropCacheVersion = useSyncExternalStore(
    subscribeAutoCropCache,
    getAutoCropCacheVersion,
    getAutoCropCacheVersion
  )

  const autoCropAllApplied = useMemo(() =>
  {
    void autoCropCacheVersion
    if (autoCropProgress.running) return false
    return areCachedAutoCropsApplied(
      autoCropTargets,
      boardAspectRatio,
      trimSoftShadows
    )
  }, [
    autoCropCacheVersion,
    autoCropProgress.running,
    autoCropTargets,
    boardAspectRatio,
    trimSoftShadows,
  ])
  const autoCropHonored = pendingBulkFit === null && autoCropAllApplied

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

  const handleAutoCropAll = useCallback(async () =>
  {
    if (autoCropTargets.length === 0 || autoCropProgress.running) return
    setPendingBulkFit(null)
    setAutoCropProgress({
      running: true,
      done: 0,
      total: autoCropTargets.length,
    })
    try
    {
      const entries = await collectAutoCropTransforms({
        targets: autoCropTargets,
        boardAspectRatio,
        trimSoftShadows,
        onProgress: () =>
          setAutoCropProgress((p) =>
            p.running ? { ...p, done: p.done + 1 } : p
          ),
      })
      if (entries.length > 0) setItemsTransform(entries)
    }
    finally
    {
      setAutoCropProgress({ running: false, done: 0, total: 0 })
    }
  }, [
    autoCropTargets,
    trimSoftShadows,
    autoCropProgress.running,
    boardAspectRatio,
    setItemsTransform,
  ])

  useEffect(() =>
  {
    if (autoCropHandledOnOpen) return
    setAutoCropHandledOnOpen(true)
    if (!autoCropAllApplied) void handleAutoCropAll()
  }, [autoCropHandledOnOpen, autoCropAllApplied, handleAutoCropAll])

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
      closeOnBackdrop={false}
      closeOnEscape={false}
      shakeOnDismissBlocked
      panelClassName="w-full p-6"
      panelStyle={{ maxWidth: panelMaxWidth }}
    >
      <ModalHeader
        titleId={titleId}
        className="text-center text-lg font-semibold text-[var(--t-text)]"
      >
        Mixed aspect ratios detected
      </ModalHeader>
      <div
        id={descId}
        className="mx-auto mt-2 max-w-xl text-center text-sm text-[var(--t-text-muted)]"
      >
        <p>
          {formatCountedWord(mismatched.length, 'item')} don&apos;t match the{' '}
          <span className="text-[var(--t-text)]">{ratioLabel}</span> board
          ratio.
        </p>
        <p>Pick a different one, or dismiss to override items individually.</p>
      </div>

      <MismatchPreviewStrip
        mismatchedItems={mismatched}
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
          showCustom={false}
        />
      </div>

      {mismatched.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BulkFitSegmentedControl
            pendingBulkFit={pendingBulkFit}
            autoCropHonored={autoCropHonored}
            autoCropRunning={autoCropProgress.running}
            autoCropAvailable={autoCropTargets.length > 0}
            onSelectFit={setPendingBulkFit}
            onSelectAutoCrop={handleAutoCropAll}
          />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {autoCropProgress.running && (
              <span
                className="text-xs tabular-nums text-[var(--t-text-muted)]"
                role="status"
                aria-live="polite"
              >
                {autoCropProgress.done}/{autoCropProgress.total}
              </span>
            )}
            <ShowLabelsToggle
              checked={effectiveShowLabels}
              onChange={handleShowLabelsChange}
            />
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--t-border-secondary)] pt-4">
        <div className="flex flex-col gap-0.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--t-text-muted)] transition-colors hover:text-[var(--t-text-secondary)]">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="focus-custom h-3.5 w-3.5 cursor-pointer accent-[var(--t-accent)]"
            />
            Don&apos;t show again
          </label>
          <span className="pl-5 text-[0.65rem] text-[var(--t-text-faint)]">
            Re-enable in board settings
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {onAdjustEach && (
            <SecondaryButton
              onClick={handleAdjustEach}
              variant="outline"
              disabled={autoCropProgress.running}
            >
              <span className="inline-flex items-center gap-1">
                Adjust each item
                <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </SecondaryButton>
          )}
          <SecondaryButton
            onClick={handleDone}
            variant="surface"
            disabled={autoCropProgress.running}
          >
            Done
          </SecondaryButton>
        </div>
      </div>
    </BaseModal>
  )
}

interface MismatchPreviewStripProps
{
  mismatchedItems: readonly TierItem[]
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  pendingBulkFit: ImageFit | null
  slotBound: number
  itemSize: ItemSize
  itemShape: ItemShape
}

const MismatchPreviewStrip = ({
  mismatchedItems,
  boardAspectRatio,
  boardDefaultFit,
  pendingBulkFit,
  slotBound,
  itemSize,
  itemShape,
}: MismatchPreviewStripProps) =>
{
  const thumbnailItems = mismatchedItems.slice(0, MAX_THUMBNAIL_PREVIEW)
  const remaining = Math.max(0, mismatchedItems.length - thumbnailItems.length)
  if (thumbnailItems.length === 0) return null

  const innerSize = itemSlotDimensions(itemSize, boardAspectRatio)
  const slotStyle = { width: slotBound, height: slotBound }
  const shapeClass = SHAPE_CLASS[itemShape]

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {thumbnailItems.map((item) =>
      {
        const previewItem =
          pendingBulkFit === null ? item : { ...item, transform: undefined }
        return (
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
                item={previewItem}
                fit={
                  pendingBulkFit ?? getEffectiveImageFit(item, boardDefaultFit)
                }
                frameAspectRatio={boardAspectRatio}
              />
            </div>
          </div>
        )
      })}
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

type BulkFitMode = ImageFit | 'auto-crop'

interface BulkFitSegmentedControlProps
{
  pendingBulkFit: ImageFit | null
  autoCropHonored: boolean
  autoCropRunning: boolean
  autoCropAvailable: boolean
  onSelectFit: (fit: ImageFit) => void
  onSelectAutoCrop: () => void
}

// 3-segment control unifying Cover / Contain / Auto-crop. Cover & Contain
// stay pending until Done (which strips any prior transform via
// setItemsImageFit). Auto-crop runs immediately since detection is async
const BulkFitSegmentedControl = ({
  pendingBulkFit,
  autoCropHonored,
  autoCropRunning,
  autoCropAvailable,
  onSelectFit,
  onSelectAutoCrop,
}: BulkFitSegmentedControlProps) =>
{
  // pendingBulkFit (Cover/Contain) wins over the auto-crop honored state so
  // the user's most recent intent is what the highlight reflects
  const value: BulkFitMode | null =
    pendingBulkFit ?? (autoCropHonored ? 'auto-crop' : null)

  const handleChange = useCallback(
    (next: BulkFitMode) =>
    {
      if (next === 'auto-crop') onSelectAutoCrop()
      else onSelectFit(next)
    },
    [onSelectAutoCrop, onSelectFit]
  )

  // reserve the width of the widest possible label so the segment doesn't
  // jitter as it cycles between idle / running / applied
  const renderAutoCropLabel = (icon: ReactNode, text: string): ReactNode => (
    <span className="relative inline-flex items-center justify-center">
      <span
        aria-hidden="true"
        className="invisible inline-flex items-center gap-1"
      >
        <Check className="h-3 w-3" />
        Auto-cropped all
      </span>
      <span className="absolute inset-0 inline-flex items-center justify-center gap-1">
        {icon}
        {text}
      </span>
    </span>
  )

  const autoCropLabel = autoCropRunning
    ? renderAutoCropLabel(
        <Loader2 className="h-3 w-3 animate-spin" />,
        'Auto-crop all'
      )
    : autoCropHonored
      ? renderAutoCropLabel(<Check className="h-3 w-3" />, 'Auto-cropped all')
      : renderAutoCropLabel(<Crop className="h-3 w-3" />, 'Auto-crop all')

  return (
    <SegmentedControl<BulkFitMode>
      ariaLabel="Bulk image fit"
      value={value}
      onChange={handleChange}
      options={[
        { value: 'cover', label: 'Cover all' },
        { value: 'contain', label: 'Contain all' },
        {
          value: 'auto-crop',
          label: autoCropLabel,
          // honored state stays selected but unclickable so re-pressing
          // doesn't re-run detection on already-cropped items
          disabled: !autoCropAvailable || autoCropRunning || autoCropHonored,
          ariaLabel: autoCropHonored
            ? 'Auto-crop applied to mismatched items'
            : 'Auto-crop all mismatched items',
          title: autoCropHonored
            ? 'Auto-crop is applied'
            : !autoCropAvailable
              ? 'No image bytes available to auto-crop'
              : 'Frame detected content for mismatched items',
        },
      ]}
    />
  )
}
