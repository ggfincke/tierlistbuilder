// src/features/workspace/settings/ui/AspectRatioIssueModal.tsx
// first-encounter prompt for mixed aspect ratio items w/ inline ratio picker

import { ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { ASPECT_RATIO_PRESETS } from '@tierlistbuilder/contracts/workspace/imageMath'
import type {
  GlobalLabelDefaults,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { formatAspectRatio } from '~/shared/board-ui/aspectRatio'
import { ITEM_LONG_EDGE_PX } from '~/shared/board-ui/constants'
import {
  getItemLabelBandVariant,
  type LabelBandVariant,
} from '~/shared/board-ui/labelBandVariant'
import {
  resolveEffectiveShowLabels,
  withBoardShowLabels,
} from '~/shared/board-ui/labelSettings'
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
import { useAspectRatioPromptState } from '../model/useAspectRatioPromptState'
import { useBoardAspectRatioPicker } from '../model/useBoardAspectRatioPicker'
import { useLabelAwareEffectiveAspect } from '../../imageEditor/model/useLabelAwareEffectiveAspect'
import { AspectRatioTiles } from './AspectRatioTiles'
import { BulkFitSegmentedControl } from './BulkFitSegmentedControl'
import {
  MISMATCH_THUMBNAIL_PREVIEW_LIMIT,
  MismatchPreviewStrip,
} from './MismatchPreviewStrip'
import { ShowLabelsToggle } from './ShowLabelsToggle'

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
  const { boardDefaultFit, boardLabels, items, setBoardLabelSettings } =
    useActiveBoardStore(
      useShallow((state) => ({
        boardDefaultFit: state.defaultItemImageFit,
        boardLabels: state.labels,
        items: state.items,
        setBoardLabelSettings: state.setBoardLabelSettings,
      }))
    )
  const {
    itemSize,
    itemShape,
    globalShowLabels,
    globalLabelPlacementMode,
    globalLabelFontSizePx,
  } = usePreferencesStore(
    useShallow((state) => ({
      itemSize: state.itemSize,
      itemShape: state.itemShape,
      globalShowLabels: state.showLabels,
      globalLabelPlacementMode: state.defaultLabelPlacementMode,
      globalLabelFontSizePx: state.defaultLabelFontSizePx,
    }))
  )
  const globalLabelDefaults = useMemo<GlobalLabelDefaults>(
    () => ({
      showLabels: globalShowLabels,
      placementMode: globalLabelPlacementMode,
      fontSizePx: globalLabelFontSizePx,
    }),
    [globalShowLabels, globalLabelPlacementMode, globalLabelFontSizePx]
  )
  const effectiveShowLabels = resolveEffectiveShowLabels(
    boardLabels,
    globalShowLabels
  )
  // capture opening mismatch set at mount; cleanup keeps these ids even if the
  // picker ratio later resolves the mismatch before Done
  const [promptSnapshot] = useState(() =>
    createAspectRatioPromptSnapshot({
      items: useActiveBoardStore.getState().items,
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
  const promptLabelVariants = useMemo<readonly LabelBandVariant[]>(() =>
  {
    const variants: LabelBandVariant[] = []
    for (const item of cleanupTargets)
    {
      const variant = getItemLabelBandVariant({
        item,
        boardLabels,
        globalLabelDefaults,
      })
      if (variant) variants.push(variant)
    }
    return variants
  }, [cleanupTargets, boardLabels, globalLabelDefaults])
  const {
    getEffectiveAspectRatio: getPromptEffectiveAspectRatio,
    measurementsReady: promptMeasurementsReady,
    measurementNodes: promptMeasurementNodes,
  } = useLabelAwareEffectiveAspect({
    boardAspectRatio,
    itemSize,
    variants: promptLabelVariants,
  })
  const getBoardAspectRatioForItem = useCallback(
    (item: TierItem): number =>
      getPromptEffectiveAspectRatio(
        getItemLabelBandVariant({ item, boardLabels, globalLabelDefaults })
      ),
    [getPromptEffectiveAspectRatio, boardLabels, globalLabelDefaults]
  )
  // alert reads the global trim setting but doesn't expose the toggle here —
  // the editor has it where users are already engaged w/ per-item tuning
  const { trimSoftShadows } = useAutoCropTrimShadows()

  const {
    autoCrop,
    autoCropPreparing,
    commitPendingFit,
    dontAskAgain,
    handleRatioOption,
    handleSelectFit,
    pendingBulkFit,
    setDontAskAgain,
  } = useAspectRatioPromptState({
    autoCropGeometryReady: promptMeasurementsReady,
    boardAspectRatio,
    cleanupTargets,
    getBoardAspectRatioForItem,
    handleOption,
    mismatched,
    openingMismatchCount: promptSnapshot.itemIds.length,
    trimSoftShadows,
  })
  const activeAutoCropPreparing = pendingBulkFit === null && autoCropPreparing
  const rerunAutoCropAfterLabelChangeRef = useRef(false)
  const handleShowLabelsChange = useCallback(
    (show: boolean) =>
    {
      const shouldRerunAutoCrop =
        pendingBulkFit === null &&
        (autoCrop.selected ||
          autoCrop.progress.running ||
          activeAutoCropPreparing)
      if (shouldRerunAutoCrop)
      {
        rerunAutoCropAfterLabelChangeRef.current = true
        autoCrop.clearPreview('labels')
      }
      setBoardLabelSettings(withBoardShowLabels(boardLabels, show))
    },
    [
      autoCrop,
      activeAutoCropPreparing,
      boardLabels,
      pendingBulkFit,
      setBoardLabelSettings,
    ]
  )

  useEffect(() =>
  {
    if (!rerunAutoCropAfterLabelChangeRef.current) return
    if (pendingBulkFit !== null)
    {
      rerunAutoCropAfterLabelChangeRef.current = false
      return
    }
    if (
      activeAutoCropPreparing ||
      autoCrop.progress.running ||
      !autoCrop.available
    )
    {
      return
    }
    rerunAutoCropAfterLabelChangeRef.current = false
    autoCrop.run()
  }, [activeAutoCropPreparing, autoCrop, pendingBulkFit])

  const handleDone = useCallback(() =>
  {
    commitPendingFit()
    close()
  }, [commitPendingFit, close])

  const handleAdjustEach = useCallback(() =>
  {
    if (autoCrop.progress.running) autoCrop.clearPreview('adjust')
    commitPendingFit()
    close()
    onAdjustEach?.()
  }, [autoCrop, commitPendingFit, close, onAdjustEach])

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
  const slotCount = MISMATCH_THUMBNAIL_PREVIEW_LIMIT + 1
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
      {promptMeasurementNodes}
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
        boardLabels={boardLabels}
        getBoardAspectRatioForItem={getBoardAspectRatioForItem}
        globalLabelDefaults={globalLabelDefaults}
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
            autoCropApplied={autoCrop.applied}
            autoCropPreparing={activeAutoCropPreparing}
            autoCropRunning={autoCrop.progress.running}
            autoCropAvailable={autoCrop.available}
            autoCropSelected={autoCrop.selected}
            onSelectFit={handleSelectFit}
            onSelectAutoCrop={autoCrop.run}
          />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {(activeAutoCropPreparing || autoCrop.progress.running) && (
              <span
                className="text-xs tabular-nums text-[var(--t-text-muted)]"
                role="status"
                aria-live="polite"
              >
                {activeAutoCropPreparing
                  ? 'Preparing'
                  : `${autoCrop.progress.done}/${autoCrop.progress.total}`}
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
            disabled={autoCrop.progress.running || activeAutoCropPreparing}
          >
            Done
          </SecondaryButton>
        </div>
      </div>
    </BaseModal>
  )
}
