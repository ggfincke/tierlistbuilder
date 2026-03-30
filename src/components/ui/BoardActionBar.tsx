// src/components/ui/BoardActionBar.tsx
// floating action bar — undo/redo, add tier, settings, export, & reset controls

import { useRef, useState } from 'react'
import {
  BookmarkPlus,
  Lock,
  Plus,
  Redo2,
  RotateCcw,
  Settings as SettingsIcon,
  Shuffle,
  Undo2,
  Unlock,
} from 'lucide-react'

import type { ImageFormat } from '../../types'
import { extractPresetFromBoard } from '../../domain/presets'
import { useHybridMenu } from '../../hooks/useHybridMenu'
import { extractBoardData } from '../../store/useTierListStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { usePresetStore } from '../../store/usePresetStore'
import { useTierListStore } from '../../store/useTierListStore'
import { usePopupClose } from '../../hooks/usePopupClose'
import { ActionButton } from './ActionButton'
import { ConfirmDialog } from './ConfirmDialog'
import { ExportMenu } from './ExportMenu'
import { OverlayMenuItem, OverlayMenuSurface } from './OverlayPrimitives'

interface BoardActionBarProps
{
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
  const {
    open: showShuffleMenu,
    closeMenu: closeShuffleMenu,
    togglePinnedOpen: toggleShuffleMenu,
  } = useHybridMenu({ disabled: boardLocked })

  usePopupClose({
    show: showShuffleMenu,
    triggerRef: shuffleButtonRef,
    popupRef: shuffleMenuRef,
    onClose: closeShuffleMenu,
  })

  // shuffle w/ confirmation when items have been manually arranged
  const handleShuffle = (mode: 'all' | 'unranked') =>
  {
    closeShuffleMenu()
    if (mode === 'all' && itemsManuallyMoved)
    {
      setConfirmShuffleAll(true)
      return
    }
    if (mode === 'all') shuffleAllItems()
    else shuffleUnrankedItems()
  }

  const savePreset = () =>
  {
    if (!presetName.trim()) return
    const data = extractBoardData(useTierListStore.getState())
    addPreset(extractPresetFromBoard(data, presetName.trim()))
    setShowSavePreset(false)
  }

  return (
    <>
      <div className="mt-3 flex justify-center">
        <div className="inline-flex items-center gap-5 rounded-[1.7rem] border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-sunken)] px-8 py-2">
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
              hasPopup="menu"
              expanded={showShuffleMenu}
              active={showShuffleMenu}
            >
              <Shuffle className="h-5 w-5" strokeWidth={1.8} />
            </ActionButton>

            {showShuffleMenu && (
              <OverlayMenuSurface
                ref={shuffleMenuRef}
                role="menu"
                className="absolute left-1/2 top-full z-30 mt-3 w-max -translate-x-1/2 animate-[menuIn_120ms_ease-out] text-sm shadow-md shadow-black/30 before:absolute before:-top-3 before:left-0 before:h-3 before:w-full"
              >
                <OverlayMenuItem
                  role="menuitem"
                  onClick={() => handleShuffle('all')}
                >
                  Shuffle All Items
                </OverlayMenuItem>
                <OverlayMenuItem
                  role="menuitem"
                  onClick={() => handleShuffle('unranked')}
                >
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
        onCancel={() => setConfirmShuffleAll(false)}
        onConfirm={() =>
        {
          shuffleAllItems()
          setConfirmShuffleAll(false)
        }}
      />

      {/* save-as-preset name prompt */}
      {showSavePreset && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => setShowSavePreset(false)}
          />
          <div className="fixed inset-0 z-50 m-auto flex h-fit w-full max-w-sm flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--t-text)]">
              Save as Preset
            </h2>
            <p className="mt-1 text-sm text-[var(--t-text-muted)]">
              Saves the current tier structure (names & colors) for reuse.
            </p>
            <input
              autoFocus
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) =>
              {
                if (e.key === 'Enter') savePreset()
                if (e.key === 'Escape') setShowSavePreset(false)
              }}
              placeholder="Preset name"
              className="mt-3 w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] outline-none focus:border-[var(--t-accent-hover)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--t-border-secondary)] px-3 py-1.5 text-sm text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]"
                onClick={() => setShowSavePreset(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!presetName.trim()}
                className="rounded-md bg-[var(--t-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--t-accent-hover)] disabled:opacity-40"
                onClick={savePreset}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
