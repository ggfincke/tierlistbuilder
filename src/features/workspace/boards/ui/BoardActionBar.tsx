// src/features/workspace/boards/ui/BoardActionBar.tsx
// floating action bar — undo/redo, add tier, settings, export, & reset controls

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  BarChart3,
  BookmarkPlus,
  ChevronRight,
  Lock,
  LogIn,
  Plus,
  Redo2,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Shuffle,
  Undo2,
  Unlock,
  UploadCloud,
} from 'lucide-react'

import type { ImageFormat } from '~/features/workspace/export/model/runtime'
import type { ExportStatus } from '~/features/workspace/export/model/useExportController'
import type { ToolbarPosition } from '@tierlistbuilder/contracts/platform/preferences'
import { extractPresetFromBoard } from '~/features/workspace/tier-presets/model/tierPresets'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { toast } from '~/shared/notifications/useToastStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import {
  selectCanRedo,
  selectCanUndo,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  useNestedMenus,
  type NestedMenuDefinition,
} from '~/shared/overlay/nestedMenus'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { useMenuOverflowFlipRefs } from '~/shared/overlay/menuOverflow'

import {
  getMenuPositionClasses,
  isVerticalPosition,
} from '~/shared/layout/toolbarPosition'
import { ActionButton } from '~/shared/ui/ActionButton'
import { ExportMenu } from '~/features/workspace/export/ui/ExportMenu'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { preloadPublishModal } from '~/features/marketplace/components/publish/loadPublishModal'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

import { SavePresetModal } from '~/features/workspace/tier-presets/ui/SavePresetModal'

type ShuffleMenuId = 'root' | 'shuffleAll'

const SHUFFLE_MENU_DEFINITIONS: readonly NestedMenuDefinition<ShuffleMenuId>[] =
  [{ id: 'root' }, { id: 'shuffleAll', parentId: 'root' }]

type SaveMenuId = 'root'

const SAVE_MENU_DEFINITIONS: readonly NestedMenuDefinition<SaveMenuId>[] = [
  { id: 'root' },
]

interface BoardActionBarProps
{
  toolbarPosition: ToolbarPosition
  onAddTier: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
  onShare: () => void
  exportControls: BoardActionBarExportControls
  publish?: BoardActionBarPublishControls
  onReset: () => void
}

interface BoardActionBarExportControls
{
  status: ExportStatus
  exportingAll: boolean
  imageFormat: ImageFormat
  onImageFormatChange: (format: ImageFormat) => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onAnnotateExport: () => void
  onPreviewExport: () => void
}

interface BoardActionBarPublishControls
{
  ranking?: () => void
  template?: () => void
  // signed-out: publish actions still appear but route to a sign-in prompt
  // instead of being hidden, so the capability stays discoverable
  signInRequired?: boolean
}

// "Sign in" affordance appended to publish menu items while signed-out
const SignInHint = () => (
  <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--t-text-faint)]">
    <LogIn className="h-3 w-3" strokeWidth={2} aria-hidden />
    Sign in
  </span>
)

// primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  toolbarPosition,
  onAddTier,
  onOpenSettings,
  onOpenStats,
  onShare,
  exportControls,
  publish,
  onReset,
}: BoardActionBarProps) =>
{
  const publishRanking = publish?.ranking
  const publishTemplate = publish?.template
  const publishSignInRequired = publish?.signInRequired ?? false
  const publishMenuItems = [
    {
      key: 'ranking',
      label: 'Publish Ranking',
      Icon: Send,
      onSelect: publishSignInRequired ? promptSignIn : publishRanking,
    },
    {
      key: 'template',
      label: 'Publish as Template',
      Icon: UploadCloud,
      onSelect: publishSignInRequired ? promptSignIn : publishTemplate,
    },
  ] as const
  const visiblePublishMenuItems = publishMenuItems.filter(
    ({ onSelect }) => publishSignInRequired || onSelect !== undefined
  )
  const isVertical = isVerticalPosition(toolbarPosition)
  const menuPos = getMenuPositionClasses(toolbarPosition)
  const { reducedMotion, boardLocked, setBoardLocked } = usePreferencesStore(
    useShallow((state) => ({
      reducedMotion: state.reducedMotion,
      boardLocked: state.boardLocked,
      setBoardLocked: state.setBoardLocked,
    }))
  )
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    itemsManuallyMoved,
    shuffleAllItems,
    shuffleUnrankedItems,
    boardTitle,
  } = useActiveBoardStore(
    useShallow((state) => ({
      canUndo: selectCanUndo(state),
      canRedo: selectCanRedo(state),
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
  const saveButtonRef = useRef<HTMLButtonElement | null>(null)
  const saveMenuRef = useRef<HTMLDivElement | null>(null)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const shuffleDialogId = useId()
  const shuffleAllGroupId = useId()
  const saveDialogId = useId()
  const disabledMenuIds = useMemo(
    () => (boardLocked ? (['root', 'shuffleAll'] as const) : ([] as const)),
    [boardLocked]
  )
  const { getRef: getOverflowRef } = useMenuOverflowFlipRefs<ShuffleMenuId>()
  const { closeAllMenus, isOpen, toggleMenu } = useNestedMenus({
    definitions: SHUFFLE_MENU_DEFINITIONS,
    disabledIds: disabledMenuIds,
  })
  const {
    closeAllMenus: closeSaveMenu,
    isOpen: isSaveOpen,
    toggleMenu: toggleSaveMenu,
  } = useNestedMenus({ definitions: SAVE_MENU_DEFINITIONS })
  const showShuffleMenu = isOpen('root')
  const showShuffleAllMenu = isOpen('shuffleAll')
  const showSaveMenu = isSaveOpen('root')
  const undoTitle = boardLocked
    ? 'Unlock board to undo changes'
    : canUndo
      ? 'Undo last change'
      : 'Nothing to undo'
  const redoTitle = boardLocked
    ? 'Unlock board to redo changes'
    : canRedo
      ? 'Redo last undone change'
      : 'Nothing to redo'
  const lockedActionTitle = boardLocked
    ? 'Unlock board to use this action'
    : undefined

  useDismissibleLayer({
    open: showShuffleMenu,
    triggerRef: shuffleButtonRef,
    layerRef: shuffleMenuRef,
    onDismiss: closeAllMenus,
  })
  useDismissibleLayer({
    open: showSaveMenu,
    triggerRef: saveButtonRef,
    layerRef: saveMenuRef,
    onDismiss: closeSaveMenu,
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
          <ActionButton
            label="Undo"
            title={undoTitle}
            onClick={() =>
            {
              const result = undo()
              if (result) toast(`Undid ${result.label.toLowerCase()}`)
            }}
            disabled={boardLocked || !canUndo}
          >
            <Undo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Redo"
            title={redoTitle}
            onClick={() =>
            {
              const result = redo()
              if (result) toast(`Redid ${result.label.toLowerCase()}`)
            }}
            disabled={boardLocked || !canRedo}
          >
            <Redo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Add tier"
            title={lockedActionTitle ?? 'Add a tier row'}
            onClick={onAddTier}
            disabled={boardLocked}
          >
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <div className="relative">
            <ActionButton
              ref={shuffleButtonRef}
              label="Shuffle items"
              title={lockedActionTitle ?? 'Shuffle items'}
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

          <ActionButton
            label="Reset board"
            title={lockedActionTitle ?? 'Reset board'}
            onClick={() => setConfirmReset(true)}
            disabled={boardLocked}
          >
            <RotateCcw className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Open settings"
            title="Open settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ExportMenu
            menuPos={menuPos}
            exportStatus={exportControls.status}
            exportingAll={exportControls.exportingAll}
            imageFormat={exportControls.imageFormat}
            onImageFormatChange={exportControls.onImageFormatChange}
            onExport={exportControls.onExport}
            onCopyToClipboard={exportControls.onCopyToClipboard}
            onExportAll={exportControls.onExportAll}
            onAnnotateExport={exportControls.onAnnotateExport}
            onPreviewExport={exportControls.onPreviewExport}
            onShare={onShare}
          />

          <ActionButton
            label="View statistics"
            title="View board statistics"
            onClick={onOpenStats}
          >
            <BarChart3 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <div className="relative">
            <ActionButton
              ref={saveButtonRef}
              label="Save or publish"
              title="Save or publish options"
              onClick={() => toggleSaveMenu('root')}
              onFocus={publishTemplate ? preloadPublishModal : undefined}
              onPointerEnter={publishTemplate ? preloadPublishModal : undefined}
              hasPopup="dialog"
              expanded={showSaveMenu}
              controlsId={saveDialogId}
              active={showSaveMenu}
              withDropdownIndicator
            >
              <BookmarkPlus className="h-5 w-5" strokeWidth={1.8} />
            </ActionButton>

            {showSaveMenu && (
              <OverlayMenuSurface
                id={saveDialogId}
                ref={saveMenuRef}
                role="dialog"
                aria-label="Save or publish options"
                className={`${menuPos.primary} flex flex-col ${menuPos.animationClass} text-sm shadow-md shadow-black/30 ${menuPos.bridge}`}
              >
                {visiblePublishMenuItems.map(
                  ({ key, label, Icon, onSelect }) => (
                    <OverlayMenuItem
                      key={key}
                      onClick={() =>
                      {
                        closeSaveMenu()
                        onSelect?.()
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {label}
                      {publishSignInRequired && <SignInHint />}
                    </OverlayMenuItem>
                  )
                )}
                {visiblePublishMenuItems.length > 0 && <OverlayDivider />}
                <OverlayMenuItem
                  onClick={() =>
                  {
                    closeSaveMenu()
                    setShowSavePreset(true)
                  }}
                >
                  <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
                  Save as Preset
                </OverlayMenuItem>
              </OverlayMenuSurface>
            )}
          </div>

          <ActionButton
            label={boardLocked ? 'Unlock board' : 'Lock board'}
            title={boardLocked ? 'Unlock board' : 'Lock board'}
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
