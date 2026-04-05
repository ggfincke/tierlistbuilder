// src/components/ui/BoardActionBar.tsx
// floating action bar — undo/redo, add tier, settings, export, & reset controls

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookmarkPlus,
  ChevronRight,
  Lock,
  Plus,
  Redo2,
  RotateCcw,
  Settings as SettingsIcon,
  Shuffle,
  Undo2,
  Unlock,
} from 'lucide-react'

import type { ImageFormat, ToolbarPosition } from '../../types'
import { extractPresetFromBoard } from '../../domain/presets'
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useHybridMenu } from '../../hooks/useHybridMenu'
import { useModalBackgroundInert } from '../../hooks/useModalBackgroundInert'
import { extractBoardData } from '../../domain/boardData'
import { useSettingsStore } from '../../store/useSettingsStore'
import { usePresetStore } from '../../store/usePresetStore'
import { useTierListStore } from '../../store/useTierListStore'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { usePopupClose } from '../../hooks/usePopupClose'
import {
  getMenuPositionClasses,
  isVerticalPosition,
} from '../../utils/menuPosition'
import { useMenuOverflowFlip } from '../../hooks/useMenuOverflowFlip'
import { ActionButton } from './ActionButton'
import { ConfirmDialog } from './ConfirmDialog'
import { ExportMenu } from './ExportMenu'
import { OverlayMenuItem, OverlayMenuSurface } from './OverlayPrimitives'
import { SecondaryButton } from './SecondaryButton'
import { TextInput } from './TextInput'

interface BoardActionBarProps
{
  toolbarPosition: ToolbarPosition
  // active export type while an export is in progress (null when idle)
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  // true while an "Export All" operation is running
  exportingAll: boolean
  onAddTier: () => void
  onOpenSettings: () => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onReset: () => void
}

// * primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  toolbarPosition,
  exportStatus,
  exportingAll,
  onAddTier,
  onOpenSettings,
  onExport,
  onCopyToClipboard,
  onExportAll,
  onReset,
}: BoardActionBarProps) =>
{
  const isVertical = isVerticalPosition(toolbarPosition)
  const menuPos = getMenuPositionClasses(toolbarPosition)
  const reducedMotion = useSettingsStore((state) => state.reducedMotion)
  const { ref: shuffleAllFlipRef } = useMenuOverflowFlip()
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  const setBoardLocked = useSettingsStore((state) => state.setBoardLocked)
  const pastLength = useTierListStore((state) => state.past.length)
  const futureLength = useTierListStore((state) => state.future.length)
  const undo = useTierListStore((state) => state.undo)
  const redo = useTierListStore((state) => state.redo)
  const itemsManuallyMoved = useTierListStore(
    (state) => state.itemsManuallyMoved
  )
  const shuffleAllItems = useTierListStore((state) => state.shuffleAllItems)
  const shuffleUnrankedItems = useTierListStore(
    (state) => state.shuffleUnrankedItems
  )
  const addPreset = usePresetStore((state) => state.addPreset)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmShuffleAll, setConfirmShuffleAll] = useState(false)
  const shuffleButtonRef = useRef<HTMLButtonElement | null>(null)
  const shuffleMenuRef = useRef<HTMLDivElement | null>(null)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const savePresetRef = useRef<HTMLDivElement | null>(null)
  const shuffleDialogId = useId()
  const shuffleAllGroupId = useId()
  const savePresetTitleId = useId()
  const savePresetDescriptionId = useId()
  const savePresetInputId = useId()
  const {
    open: showShuffleMenu,
    closeMenu: closeShuffleMenuRoot,
    togglePinnedOpen: toggleShuffleMenu,
  } = useHybridMenu({ disabled: boardLocked })

  const {
    open: showShuffleAllMenu,
    closeMenu: closeShuffleAllMenu,
    togglePinnedOpen: toggleShuffleAllMenu,
  } = useHybridMenu({ disabled: boardLocked })

  const closeShuffleMenu = useCallback(() =>
  {
    closeShuffleMenuRoot()
    closeShuffleAllMenu()
  }, [closeShuffleMenuRoot, closeShuffleAllMenu])

  // collapse submenu when root menu closes
  useEffect(() =>
  {
    if (!showShuffleMenu) closeShuffleAllMenu()
  }, [showShuffleMenu, closeShuffleAllMenu])

  usePopupClose({
    show: showShuffleMenu,
    triggerRef: shuffleButtonRef,
    popupRef: shuffleMenuRef,
    onClose: closeShuffleMenu,
  })

  // pending shuffle mode for the confirmation dialog
  const [pendingShuffleMode, setPendingShuffleMode] = useState<
    'even' | 'random' | null
  >(null)

  // shuffle w/ confirmation when items have been manually arranged
  const handleShuffle = (mode: 'even' | 'random' | 'unranked') =>
  {
    closeShuffleMenu()
    if (mode === 'unranked')
    {
      shuffleUnrankedItems()
      return
    }
    if (itemsManuallyMoved)
    {
      setPendingShuffleMode(mode)
      setConfirmShuffleAll(true)
      return
    }
    shuffleAllItems(mode)
  }

  useFocusTrap(savePresetRef, showSavePreset)
  useModalBackgroundInert(showSavePreset)
  useDismissibleLayer({
    open: showSavePreset,
    layerRef: savePresetRef,
    onDismiss: () => setShowSavePreset(false),
    stopEscapePropagation: true,
  })

  const savePreset = () =>
  {
    if (!presetName.trim()) return
    const data = extractBoardData(useTierListStore.getState())
    addPreset(extractPresetFromBoard(data, presetName.trim()))
    setShowSavePreset(false)
  }

  return (
    <>
      <div
        className={`flex justify-center ${reducedMotion ? '' : 'transition-[padding,gap] duration-150 ease-out'}`}
      >
        <div
          className={`inline-flex items-center justify-center gap-3 rounded-[1.7rem] border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-sunken)] ${
            isVertical
              ? 'flex-col px-1.5 py-4 sm:px-2 sm:py-6'
              : 'flex-wrap px-4 py-1.5 sm:gap-5 sm:px-8 sm:py-2'
          }`}
        >
          {/* undo & redo controls */}
          <ActionButton
            label="Undo"
            title="Undo"
            onClick={undo}
            disabled={boardLocked || pastLength === 0}
          >
            <Undo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Redo"
            title="Redo"
            onClick={redo}
            disabled={boardLocked || futureLength === 0}
          >
            <Redo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* add a new tier row to the bottom of the board */}
          <ActionButton
            label="Add tier"
            title="Add Tier"
            onClick={onAddTier}
            disabled={boardLocked}
          >
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* shuffle dropdown — distribute items randomly across tiers */}
          <div className="relative">
            <ActionButton
              ref={shuffleButtonRef}
              label="Shuffle items"
              title="Shuffle"
              onClick={toggleShuffleMenu}
              disabled={boardLocked}
              hasPopup="dialog"
              expanded={showShuffleMenu}
              controlsId={shuffleDialogId}
              active={showShuffleMenu}
            >
              <Shuffle className="h-5 w-5" strokeWidth={1.8} />
            </ActionButton>

            {showShuffleMenu && (
              <OverlayMenuSurface
                id={shuffleDialogId}
                ref={shuffleMenuRef}
                role="dialog"
                aria-label="Shuffle options"
                className={`${menuPos.primary} flex flex-col ${menuPos.animationClass} text-sm shadow-md shadow-black/30 ${menuPos.bridge}`}
              >
                {/* shuffle all submenu — even or random distribution */}
                <div className="relative">
                  <OverlayMenuItem
                    aria-controls={shuffleAllGroupId}
                    aria-haspopup="dialog"
                    aria-expanded={showShuffleAllMenu}
                    className={`${showShuffleAllMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-6`}
                    onClick={toggleShuffleAllMenu}
                  >
                    Shuffle All
                    <ChevronRight
                      className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                    />
                  </OverlayMenuItem>

                  {showShuffleAllMenu && (
                    <OverlayMenuSurface
                      id={shuffleAllGroupId}
                      ref={shuffleAllFlipRef}
                      role="group"
                      aria-label="Shuffle all options"
                      className={`${menuPos.sub} text-sm shadow-md shadow-black/30 ${menuPos.subBridge}`}
                    >
                      <OverlayMenuItem onClick={() => handleShuffle('even')}>
                        Distribute Evenly
                      </OverlayMenuItem>
                      <OverlayMenuItem onClick={() => handleShuffle('random')}>
                        Fully Random
                      </OverlayMenuItem>
                    </OverlayMenuSurface>
                  )}
                </div>

                <OverlayMenuItem onClick={() => handleShuffle('unranked')}>
                  Shuffle Unranked Only
                </OverlayMenuItem>
              </OverlayMenuSurface>
            )}
          </div>

          {/* reset — requires confirmation before restoring default tiers */}
          <ActionButton
            label="Reset board"
            title="Reset"
            onClick={() => setConfirmReset(true)}
            disabled={boardLocked}
          >
            <RotateCcw className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* open the settings panel for image import & tier management */}
          <ActionButton
            label="Open settings"
            title="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* export button w/ dropdown menu */}
          <ExportMenu
            menuPos={menuPos}
            exportStatus={exportStatus}
            exportingAll={exportingAll}
            onExport={onExport}
            onCopyToClipboard={onCopyToClipboard}
            onExportAll={onExportAll}
          />

          {/* save current tier structure as a reusable preset */}
          <ActionButton
            label="Save as preset"
            title="Save Preset"
            onClick={() =>
            {
              setPresetName(useTierListStore.getState().title)
              setShowSavePreset(true)
            }}
          >
            <BookmarkPlus className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* lock / unlock toggle */}
          <ActionButton
            label={boardLocked ? 'Unlock board' : 'Lock board'}
            title={boardLocked ? 'Unlock' : 'Lock'}
            onClick={() => setBoardLocked(!boardLocked)}
          >
            {boardLocked ? (
              <Lock className="h-5 w-5" strokeWidth={1.8} />
            ) : (
              <Unlock className="h-5 w-5" strokeWidth={1.8} />
            )}
          </ActionButton>
        </div>
      </div>

      {/* confirmation dialog shown before the destructive reset action */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset board?"
        description="This restores the default tiers and moves all items back to the unranked pool."
        confirmText="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() =>
        {
          onReset()
          setConfirmReset(false)
        }}
      />

      {/* confirmation dialog shown before shuffling placed items */}
      <ConfirmDialog
        open={confirmShuffleAll}
        title="Shuffle all items?"
        description="This will re-distribute all items randomly across tiers, replacing your current arrangement."
        confirmText="Shuffle"
        variant="accent"
        onCancel={() =>
        {
          setConfirmShuffleAll(false)
          setPendingShuffleMode(null)
        }}
        onConfirm={() =>
        {
          shuffleAllItems(pendingShuffleMode ?? 'even')
          setConfirmShuffleAll(false)
          setPendingShuffleMode(null)
        }}
      />

      {/* save-as-preset name prompt */}
      {showSavePreset &&
        createPortal(
          <>
            <div className="fixed inset-0 z-50 bg-black/60" />
            <div
              ref={savePresetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={savePresetTitleId}
              aria-describedby={savePresetDescriptionId}
              className="fixed inset-0 z-50 m-auto flex h-fit w-full max-w-sm flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl"
            >
              <h2
                id={savePresetTitleId}
                className="text-lg font-semibold text-[var(--t-text)]"
              >
                Save as Preset
              </h2>
              <p
                id={savePresetDescriptionId}
                className="mt-1 text-sm text-[var(--t-text-muted)]"
              >
                Saves the current tier structure (names & colors) for reuse.
              </p>
              <label htmlFor={savePresetInputId} className="sr-only">
                Preset name
              </label>
              <TextInput
                id={savePresetInputId}
                autoFocus
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) =>
                {
                  if (e.key === 'Enter') savePreset()
                }}
                placeholder="Preset name"
                size="md"
                className="mt-3 w-full rounded-lg border-[var(--t-border)] focus:border-[var(--t-accent-hover)]"
              />
              <div className="mt-3 flex justify-end gap-2">
                <SecondaryButton onClick={() => setShowSavePreset(false)}>
                  Cancel
                </SecondaryButton>
                <button
                  type="button"
                  disabled={!presetName.trim()}
                  className="focus-custom rounded-md bg-[var(--t-accent)] px-3 py-1.5 text-sm font-medium text-[var(--t-accent-foreground)] hover:bg-[var(--t-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:opacity-40"
                  onClick={savePreset}
                >
                  Save
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}
