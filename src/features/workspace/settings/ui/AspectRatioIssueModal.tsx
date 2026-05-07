// src/features/workspace/settings/ui/AspectRatioIssueModal.tsx
// first-encounter prompt for mixed aspect ratio items w/ inline ratio picker

import { Check, ChevronRight, Crop, Loader2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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
} from '@tierlistbuilder/contracts/platform/preferences'
import { ASPECT_RATIO_PRESETS } from '@tierlistbuilder/contracts/workspace/imageMath'
import {
  formatAspectRatio,
  getEffectiveImageFit,
  type RatioOption,
} from '~/shared/board-ui/aspectRatio'
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
import { getAutoCropImageRef } from '~/shared/lib/autoCrop'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useAspectRatioPrompt } from '../model/useAspectRatioPrompt'
import { useAutoCropTrimShadows } from '../model/useAutoCropTrimShadows'
import {
  createAspectRatioPromptSnapshot,
  resolveAspectRatioPromptItems,
} from '../model/aspectRatioPromptSnapshot'
import { useBoardAspectRatioPicker } from '../model/useBoardAspectRatioPicker'
import { AspectRatioTiles } from './AspectRatioTiles'
import { SegmentedControl } from '~/shared/ui/settings/SegmentedControl'
import { ShowLabelsToggle } from './ShowLabelsToggle'
import { useAutoCropController } from '../model/useAutoCropController'

const MAX_THUMBNAIL_PREVIEW = 4

// extra room beyond the tile strip — padding + a small breathing margin; keeps
// the modal wide enough that chips/footer don't feel cramped next to the tiles
const MODAL_CHROME_PX = 80

interface AspectRatioIssueModalProps
{
  onAdjustEach?: () => void
  onAdjustEachIntent?: () => void
}

// outer wrapper — gates on isOpen so the body unmounts (& its local state
// resets) whenever the modal closes, instead of doing reset-in-effect
export const AspectRatioIssueModal = ({
  onAdjustEach,
  onAdjustEachIntent,
}: AspectRatioIssueModalProps) =>
{
  const { isOpen } = useAspectRatioPrompt()
  if (!isOpen) return null
  return (
    <AspectRatioIssueModalBody
      onAdjustEach={onAdjustEach}
      onAdjustEachIntent={onAdjustEachIntent}
    />
  )
}

const AspectRatioIssueModalBody = ({
  onAdjustEach,
  onAdjustEachIntent,
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
  } = useBoardAspectRatioPicker()
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
  const { itemSize, itemShape, globalShowLabels } = usePreferencesStore(
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

  // capture the opening mismatch set; cleanup keeps these ids even if the
  // picker ratio makes them match before Done
  const [promptSnapshot] = useState(() =>
    createAspectRatioPromptSnapshot({
      items,
      itemAspectRatio: boardAspectRatio,
    })
  )

  const { current: mismatched, cleanup: cleanupTargets } = useMemo(
    () =>
      resolveAspectRatioPromptItems(promptSnapshot, {
        items,
        itemAspectRatio: boardAspectRatio,
      }),
    [items, boardAspectRatio, promptSnapshot]
  )

  const autoCropTargets = useMemo(
    () => cleanupTargets.filter((item) => !!getAutoCropImageRef(item)),
    [cleanupTargets]
  )

  // stage bulk fit previews until Done / Adjust each
  // prefer auto-crop when image bytes exist; cover is fallback
  // strip stale transforms on Done when auto-crop can't run
  const [pendingBulkFit, setPendingBulkFit] = useState<ImageFit | null>(() =>
  {
    if (cleanupTargets.length === 0) return null
    if (autoCropTargets.length > 0) return null
    return 'cover'
  })
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const autoCrop = useAutoCropController({
    boardAspectRatio,
    cleanupTargets,
    currentMismatchItems: mismatched,
    openingMismatchCount: promptSnapshot.itemIds.length,
    pendingBulkFit,
    setItemsTransform,
    setPendingBulkFit,
    targets: autoCropTargets,
    trimSoftShadows,
  })

  // Run prompt-open auto-crop as a one-shot default, not user intent.
  // Do not call run(); it reintroduces 2:3 -> 1:1 bulk crop regressions.
  // Change only w/ explicit product clarification on ratio-chip behavior.
  const didAutoStartAutoCropRef = useRef(false)
  useEffect(() =>
  {
    if (didAutoStartAutoCropRef.current) return
    if (!autoCrop.available) return
    if (autoCrop.honored || autoCrop.progress.running) return
    didAutoStartAutoCropRef.current = true
    autoCrop.runAutoDefault()
  }, [autoCrop])

  const commitPendingFit = useCallback(() =>
  {
    if (pendingBulkFit !== null)
    {
      const ids = cleanupTargets.map((item) => item.id)
      setItemsImageFit(ids, pendingBulkFit)
      // pin the board default so later imports inherit the same fit
      setDefaultItemImageFit(pendingBulkFit)
    }
    if (dontAskAgain) setAspectRatioPromptDismissed(true)
  }, [
    pendingBulkFit,
    cleanupTargets,
    setItemsImageFit,
    setDefaultItemImageFit,
    dontAskAgain,
    setAspectRatioPromptDismissed,
  ])

  const handleSelectFit = useCallback(
    (fit: ImageFit) =>
    {
      autoCrop.tearDownIntent('fit')
      setPendingBulkFit(fit)
    },
    [autoCrop]
  )

  const handleRatioOption = useCallback(
    (option: RatioOption) =>
    {
      // Cancel auto-crop before board ratio changes.
      // Expanded mismatch sets must not inherit stale crop intent.
      // Change only w/ explicit clarification on modal ratio flow.
      if (autoCrop.intent || autoCrop.honored || autoCrop.progress.running)
      {
        autoCrop.tearDownIntent('ratio')
        setPendingBulkFit(cleanupTargets.length > 0 ? 'cover' : null)
      }
      handleOption(option)
    },
    [autoCrop, cleanupTargets.length, handleOption]
  )

  const handleDone = useCallback(() =>
  {
    commitPendingFit()
    close()
  }, [commitPendingFit, close])

  const handleAdjustEach = useCallback(() =>
  {
    commitPendingFit()
    close()
    onAdjustEach?.()
  }, [commitPendingFit, close, onAdjustEach])

  const ratioLabel = formatAspectRatio(boardAspectRatio)

  // capture worst-case ratio across preset chips & opening ratios
  // keep the slot grid width stable while picker ratios change
  // render inner thumbs at the live ratio
  const [stableMaxAxisRatio] = useState(() =>
  {
    const candidates = [
      ...ASPECT_RATIO_PRESETS.map((preset) => preset.value),
      boardAspectRatio,
      autoRatio,
    ]
    return candidates.reduce((max, ratio) =>
    {
      if (!Number.isFinite(ratio) || ratio <= 0) return max
      return Math.max(max, ratio, 1 / ratio)
    }, 1)
  })

  // edge·√r matches itemSlotDimensions: the longer side of the largest slot
  const slotBound = Math.round(
    ITEM_LONG_EDGE_PX[itemSize] * Math.sqrt(stableMaxAxisRatio)
  )
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
        mismatchedItems={cleanupTargets}
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
          onSelect={handleRatioOption}
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

      {cleanupTargets.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BulkFitSegmentedControl
            pendingBulkFit={pendingBulkFit}
            autoCropHonored={autoCrop.honored}
            autoCropRunning={autoCrop.progress.running}
            autoCropAvailable={autoCrop.available}
            autoCropIntent={autoCrop.intent}
            onSelectFit={handleSelectFit}
            onSelectAutoCrop={autoCrop.run}
          />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {autoCrop.progress.running && (
              <span
                className="text-xs tabular-nums text-[var(--t-text-muted)]"
                role="status"
                aria-live="polite"
              >
                {autoCrop.progress.done}/{autoCrop.progress.total}
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
              onFocus={onAdjustEachIntent}
              onPointerEnter={onAdjustEachIntent}
              variant="outline"
              disabled={autoCrop.progress.running}
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
            disabled={autoCrop.progress.running}
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

interface AutoCropSegmentState
{
  autoCropAvailable: boolean
  autoCropHonored: boolean
  autoCropRunning: boolean
}

interface BulkFitSegmentedControlProps
{
  pendingBulkFit: ImageFit | null
  autoCropHonored: boolean
  autoCropIntent: boolean
  autoCropRunning: boolean
  autoCropAvailable: boolean
  onSelectFit: (fit: ImageFit) => void
  onSelectAutoCrop: () => void
}

// reserve widest label width so the segment doesn't jitter across states
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

const getAutoCropLabel = ({
  autoCropHonored,
  autoCropRunning,
}: AutoCropSegmentState): ReactNode =>
{
  if (autoCropRunning)
  {
    return renderAutoCropLabel(
      <Loader2 className="h-3 w-3 animate-spin" />,
      'Auto-crop all'
    )
  }
  if (autoCropHonored)
  {
    return renderAutoCropLabel(
      <Check className="h-3 w-3" />,
      'Auto-cropped all'
    )
  }
  return renderAutoCropLabel(<Crop className="h-3 w-3" />, 'Auto-crop all')
}

const getAutoCropTitle = ({
  autoCropAvailable,
  autoCropHonored,
}: AutoCropSegmentState): string =>
{
  if (autoCropHonored) return 'Auto-crop is applied'
  if (!autoCropAvailable) return 'No image bytes available to auto-crop'
  return 'Frame detected content for mismatched items'
}

// 3-segment control unifying Cover / Contain / Auto-crop. Cover & Contain
// stay pending until Done (which strips any prior transform via
// setItemsImageFit). Auto-crop runs immediately since detection is async
const BulkFitSegmentedControl = ({
  pendingBulkFit,
  autoCropHonored,
  autoCropIntent,
  autoCropRunning,
  autoCropAvailable,
  onSelectFit,
  onSelectAutoCrop,
}: BulkFitSegmentedControlProps) =>
{
  // pendingBulkFit (Cover/Contain) wins over the auto-crop honored state so
  // the user's most recent intent is what the highlight reflects
  const value: BulkFitMode | null =
    pendingBulkFit ??
    (autoCropIntent || autoCropHonored || autoCropRunning ? 'auto-crop' : null)

  const handleChange = useCallback(
    (next: BulkFitMode) =>
    {
      if (next === 'auto-crop') onSelectAutoCrop()
      else onSelectFit(next)
    },
    [onSelectAutoCrop, onSelectFit]
  )

  const autoCropState = {
    autoCropAvailable,
    autoCropHonored,
    autoCropRunning,
  }
  const autoCropLabel = getAutoCropLabel(autoCropState)

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
          title: getAutoCropTitle(autoCropState),
        },
      ]}
    />
  )
}
