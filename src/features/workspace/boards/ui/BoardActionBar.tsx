// src/features/workspace/boards/ui/BoardActionBar.tsx
// floating action bar — undo/redo, add tier, settings, export, & reset controls

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  BarChart3,
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

import type { ImageFormat } from '@/shared/types/export'
import type { ToolbarPosition } from '@/shared/types/settings'
import { extractPresetFromBoard } from '@/features/workspace/tier-presets/model/tierPresets'
import { extractBoardData } from '@/features/workspace/boards/model/boardSnapshot'
import { toast } from '@/shared/notifications/useToastStore'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useTierPresetStore } from '@/features/workspace/tier-presets/model/useTierPresetStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import {
  useNestedMenus,
  type NestedMenuDefinition,
} from '@/shared/overlay/useNestedMenus'
import { useDismissibleLayer } from '@/shared/overlay/useDismissibleLayer'
import {
  getMenuPositionClasses,
  isVerticalPosition,
} from '@/shared/layout/toolbarPosition'
import { useMenuOverflowFlipRefs } from '@/shared/overlay/useMenuOverflowFlip'
import { ActionButton } from '@/shared/ui/ActionButton'
import { ConfirmDialog } from '@/shared/overlay/ConfirmDialog'
import { ExportMenu } from '@/features/workspace/export/ui/ExportMenu'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '@/shared/overlay/OverlayPrimitives'
import { SavePresetModal } from '@/features/workspace/tier-presets/ui/SavePresetModal'

type ShuffleMenuId = 'root' | 'shuffleAll'

const SHUFFLE_MENU_DEFINITIONS: readonly NestedMenuDefinition<ShuffleMenuId>[] =
  [{ id: 'root' }, { id: 'shuffleAll', parentId: 'root' }]

interface BoardActionBarProps
{
  toolbarPosition: ToolbarPosition
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  exportingAll: boolean
  onAddTier: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onAnnotateExport: () => void
  onPreviewExport: () => void
  onReset: () => void
}

// * primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  toolbarPosition,
  exportStatus,
  exportingAll,
  onAddTier,
  onOpenSettings,
  onOpenStats,
  onExport,
  onCopyToClipboard,
  onExportAll,
  onAnnotateExport,
  onPreviewExport,
  onReset,
}: BoardActionBarProps) =>
{
  const isVertical = isVerticalPosition(toolbarPosition)
  const menuPos = getMenuPositionClasses(toolbarPosition)
  const { reducedMotion, boardLocked, setBoardLocked } = useSettingsStore(
    useShallow((state) => ({
      reducedMotion: state.reducedMotion,
      boardLocked: state.boardLocked,
      setBoardLocked: state.setBoardLocked,
    }))
  )
  const pastLength = useActiveBoardStore((state) => state.past.length)
  const futureLength = useActiveBoardStore((state) => state.future.length)
  const {
    undo,
    redo,
    itemsManuallyMoved,
    shuffleAllItems,
    shuffleUnrankedItems,
    boardTitle,
  } = useActiveBoardStore(
    useShallow((state) => ({
      undo: state.undo,
      redo: state.redo,
      itemsManuallyMoved: state.itemsManuallyMoved,
      shuffleAllItems: state.shuffleAllItems,
      shuffleUnrankedItems: state.shuffleUnrankedItems,
      boardTitle: state.title,
    }))
  )
  const addPreset = useTierPresetStore((state) => state.addPreset)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmShuffleAll, setConfirmShuffleAll] = useState(false)
  const shuffleButtonRef = useRef<HTMLButtonElement | null>(null)
  const shuffleMenuRef = useRef<HTMLDivElement | null>(null)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const shuffleDialogId = useId()
  const shuffleAllGroupId = useId()
  const disabledMenuIds = useMemo(
    () => (boardLocked ? (['root', 'shuffleAll'] as const) : ([] as const)),
    [boardLocked]
  )
  const { getRef: getOverflowRef } = useMenuOverflowFlipRefs<ShuffleMenuId>()
  const { closeAllMenus, isOpen, toggleMenu } = useNestedMenus({
    definitions: SHUFFLE_MENU_DEFINITIONS,
    disabledIds: disabledMenuIds,
  })
  const showShuffleMenu = isOpen('root')
  const showShuffleAllMenu = isOpen('shuffleAll')

  useDismissibleLayer({
    open: showShuffleMenu,
    triggerRef: shuffleButtonRef,
    layerRef: shuffleMenuRef,
    onDismiss: closeAllMenus,
  })

  // pending shuffle mode for the confirmation dialog
  const [pendingShuffleMode, setPendingShuffleMode] = useState<
    'even' | 'random' | null
  >(null)

  // shuffle w/ confirmation when items have been manually arranged
  const handleShuffle = (mode: 'even' | 'random' | 'unranked') =>
  {
    closeAllMenus()
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

  const handleSavePreset = useCallback(
    (presetName: string) =>
    {
      const data = extractBoardData(useActiveBoardStore.getState())
      addPreset(extractPresetFromBoard(data, presetName))
    },
    [addPreset]
  )

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
            onClick={() =>
            {
              undo()
              toast('Undone')
            }}
            disabled={boardLocked || pastLength === 0}
          >
            <Undo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Redo"
            title="Redo"
            onClick={() =>
            {
              redo()
              toast('Redone')
            }}
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
              onClick={() => toggleMenu('root')}
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
                    onClick={() => toggleMenu('shuffleAll')}
                  >
                    Shuffle All
                    <ChevronRight
                      className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                    />
                  </OverlayMenuItem>

                  {showShuffleAllMenu && (
                    <OverlayMenuSurface
                      id={shuffleAllGroupId}
                      ref={getOverflowRef('shuffleAll')}
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
            onAnnotateExport={onAnnotateExport}
            onPreviewExport={onPreviewExport}
          />

          {/* board statistics modal */}
          <ActionButton
            label="View statistics"
            title="Statistics"
            onClick={onOpenStats}
          >
            <BarChart3 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* save current tier structure as a reusable preset */}
          <ActionButton
            label="Save as preset"
            title="Save Preset"
            onClick={() => setShowSavePreset(true)}
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

      {showSavePreset && (
        <SavePresetModal
          defaultName={boardTitle}
          onClose={() => setShowSavePreset(false)}
          onSave={handleSavePreset}
        />
      )}
    </>
  )
}
