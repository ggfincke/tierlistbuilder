// src/features/workspace/boards/ui/ToolbarCoreActions.tsx
// undo/redo, add, shuffle, reset, & settings controls for the board toolbar

import { useId, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  ChevronRight,
  Plus,
  Redo2,
  RotateCcw,
  Settings as SettingsIcon,
  Shuffle,
  Undo2,
} from 'lucide-react'

import {
  selectCanRedo,
  selectCanUndo,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import { toast } from '~/shared/notifications/useToastStore'
import { useMenuOverflowFlipRefs } from '~/shared/overlay/menuOverflow'
import {
  useNestedDropdown,
  type NestedMenuDefinition,
} from '~/shared/overlay/nestedMenus'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'
import { ActionButton } from '~/shared/ui/ActionButton'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import type { BoardActionBarMenuPosition } from './BoardActionBar.types'

type ShuffleMenuId = 'root' | 'shuffleAll'

const SHUFFLE_MENU_DEFINITIONS: readonly NestedMenuDefinition<ShuffleMenuId>[] =
  [{ id: 'root' }, { id: 'shuffleAll', parentId: 'root' }]

interface ToolbarCoreActionsProps
{
  boardLocked: boolean
  menuPos: BoardActionBarMenuPosition
  onAddTier: () => void
  onOpenSettings: () => void
  onReset: () => void
}

export const ToolbarCoreActions = ({
  boardLocked,
  menuPos,
  onAddTier,
  onOpenSettings,
  onReset,
}: ToolbarCoreActionsProps) =>
{
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    itemsManuallyMoved,
    shuffleAllItems,
    shuffleUnrankedItems,
  } = useActiveBoardStore(
    useShallow((state) => ({
      canUndo: selectCanUndo(state),
      canRedo: selectCanRedo(state),
      undo: state.undo,
      redo: state.redo,
      itemsManuallyMoved: state.itemsManuallyMoved,
      shuffleAllItems: state.shuffleAllItems,
      shuffleUnrankedItems: state.shuffleUnrankedItems,
    }))
  )
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmShuffleAll, setConfirmShuffleAll] = useState(false)
  const [pendingShuffleMode, setPendingShuffleMode] = useState<
    'even' | 'random' | null
  >(null)
  const shuffleAllGroupId = useId()
  const disabledMenuIds = useMemo(
    () => (boardLocked ? (['root', 'shuffleAll'] as const) : ([] as const)),
    [boardLocked]
  )
  const { getRef: getOverflowRef } = useMenuOverflowFlipRefs<ShuffleMenuId>()
  const {
    buttonRef: shuffleButtonRef,
    menuRef: shuffleMenuRef,
    dialogId: shuffleDialogId,
    closeAllMenus,
    isOpen,
    isRootOpen: showShuffleMenu,
    toggleMenu,
  } = useNestedDropdown({
    rootId: 'root',
    definitions: SHUFFLE_MENU_DEFINITIONS,
    disabledIds: disabledMenuIds,
  })
  const showShuffleAllMenu = isOpen('shuffleAll')
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

  return (
    <>
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
    </>
  )
}
