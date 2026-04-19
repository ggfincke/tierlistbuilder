// src/features/workspace/boards/ui/BoardManager.tsx
// floating bottom-right panel for switching between multiple tier lists

import { lazy, Suspense, useCallback, useId, useRef, useState } from 'react'
import {
  Copy,
  History,
  Layers,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { ToolbarPosition } from '@tierlistbuilder/contracts/workspace/settings'
import {
  createBoardSession,
  createBoardSessionFromPreset,
  deleteBoardSession,
  duplicateBoardSession,
  renameBoardSession,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { useInlineEdit } from '~/shared/hooks/useInlineEdit'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useDismissibleLayer } from '~/shared/overlay/useDismissibleLayer'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { OverlayPanelSurface } from '~/shared/overlay/OverlayPrimitives'
import { PresetPickerModal } from '~/features/workspace/tier-presets/ui/PresetPickerModal'
import { TextInput } from '~/shared/ui/TextInput'
import { BoardSyncBadge } from '~/features/workspace/boards/ui/BoardSyncBadge'

const RecentlyDeletedModal = lazy(() =>
  import('~/features/workspace/boards/ui/RecentlyDeletedModal').then((m) => ({
    default: m.RecentlyDeletedModal,
  }))
)

const RecentSharesModal = lazy(() =>
  import('~/features/workspace/sharing/ui/RecentSharesModal').then((m) => ({
    default: m.RecentSharesModal,
  }))
)

interface BoardManagerProps
{
  toolbarPosition: ToolbarPosition
  cloudEnabled: boolean
  onSwitchBoard: (boardId: BoardId) => void
}

export const BoardManager = ({
  toolbarPosition,
  cloudEnabled,
  onSwitchBoard,
}: BoardManagerProps) =>
{
  const { boards, activeBoardId } = useWorkspaceBoardRegistryStore(
    useShallow((s) => ({
      boards: s.boards,
      activeBoardId: s.activeBoardId,
    }))
  )

  // shift the FAB to the left side when toolbar is on the right
  const flipSide = toolbarPosition === 'right'

  const [open, setOpen] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false)
  const [showRecentShares, setShowRecentShares] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<BoardId | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelId = useId()
  const panelTitleId = useId()
  const {
    cancelEdit,
    getInputProps,
    inputRef: editInputRef,
    isEditing,
    startEdit,
  } = useInlineEdit<BoardId>({
    onCommit: renameBoardSession,
  })

  useDismissibleLayer({
    open,
    triggerRef,
    layerRef: panelRef,
    onDismiss: useCallback(() =>
    {
      setOpen(false)
      cancelEdit()
    }, [cancelEdit]),
  })

  const boardToDelete = confirmDeleteId
    ? boards.find((b) => b.id === confirmDeleteId)
    : null

  return (
    <>
      {!showPresetPicker && (
        <button
          ref={triggerRef}
          type="button"
          aria-label="Board manager"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          title="Your Lists"
          onClick={() =>
          {
            setOpen((current) =>
            {
              if (current)
              {
                cancelEdit()
              }

              return !current
            })
          }}
          className={`focus-custom board-manager-trigger fixed z-40 flex items-center gap-1.5 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2 text-sm text-[var(--t-text)] shadow-lg transition hover:border-[var(--t-border-secondary)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-page)] ${flipSide ? 'board-manager-flip' : ''}`}
        >
          <Layers className="h-4 w-4" strokeWidth={1.8} />
          <span className="font-medium">{boards.length}</span>
        </button>
      )}

      {open && (
        <OverlayPanelSurface
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-labelledby={panelTitleId}
          className={`board-manager-panel fixed z-50 flex w-64 max-w-[calc(100vw-1.5rem)] flex-col animate-[slideUp_150ms_ease-out] ${flipSide ? 'board-manager-flip' : ''}`}
        >
          <div className="flex items-center justify-between border-b border-[var(--t-border)] px-3 py-2.5">
            <span
              id={panelTitleId}
              className="text-sm font-semibold text-[var(--t-text)]"
            >
              Your Lists
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {boards.map((board) =>
            {
              const isActive = board.id === activeBoardId
              const boardIsEditing = isEditing(board.id)
              return (
                <div
                  key={board.id}
                  className={`group flex items-center gap-2 px-3 py-2 transition max-sm:py-3 ${
                    isActive
                      ? 'bg-[var(--t-bg-active)]'
                      : 'hover:bg-[var(--t-bg-hover)]'
                  }`}
                >
                  <div
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isActive ? 'bg-[var(--t-accent)]' : 'bg-transparent'
                    }`}
                  />

                  {boardIsEditing ? (
                    <TextInput
                      ref={editInputRef}
                      variant="ghost"
                      size="sm"
                      {...getInputProps({
                        'aria-label': `Rename ${board.title}`,
                        className: 'min-w-0 flex-1 rounded-none px-0 py-0',
                      })}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          {
                          onSwitchBoard(board.id)
                          setOpen(false)
                        }}
                        className={`focus-custom min-w-0 flex-1 truncate text-left text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] ${
                          isActive
                            ? 'font-medium text-[var(--t-text)]'
                            : 'text-[var(--t-text-muted)] hover:text-[var(--t-text)]'
                        }`}
                      >
                        {board.title}
                      </button>

                      <BoardSyncBadge
                        boardId={board.id}
                        boardTitle={board.title}
                      />

                      <button
                        type="button"
                        aria-label={`Rename ${board.title}`}
                        onClick={() => startEdit(board.id, board.title)}
                        className="focus-custom shrink-0 rounded p-0.5 text-[var(--t-text-dim)] opacity-0 transition hover:text-[var(--t-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] group-hover:opacity-100 group-focus-within:opacity-100 max-sm:p-1.5"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        aria-label={`Duplicate ${board.title}`}
                        onClick={() =>
                          {
                          duplicateBoardSession(board.id)
                          setOpen(false)
                        }}
                        className="focus-custom shrink-0 rounded p-0.5 text-[var(--t-text-dim)] opacity-0 transition hover:text-[var(--t-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] group-hover:opacity-100 group-focus-within:opacity-100 max-sm:p-1.5"
                      >
                        <Copy className="h-3 w-3" />
                      </button>

                      {boards.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Delete ${board.title}`}
                          onClick={() => setConfirmDeleteId(board.id)}
                          className="focus-custom shrink-0 rounded p-0.5 text-[var(--t-text-dim)] opacity-0 transition hover:text-[var(--t-destructive-hover)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] group-hover:opacity-100 group-focus-within:opacity-100 max-sm:p-1.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-[var(--t-border)] px-3 py-2">
            <button
              type="button"
              onClick={() =>
              {
                setOpen(false)
                setShowPresetPicker(true)
              }}
              className="focus-custom flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)]"
            >
              <Plus className="h-3.5 w-3.5" />
              New List
            </button>
          </div>

          {cloudEnabled && (
            <div className="border-t border-[var(--t-border)] px-3 py-2">
              <button
                type="button"
                onClick={() =>
                {
                  setOpen(false)
                  setShowRecentlyDeleted(true)
                }}
                className="focus-custom flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)]"
              >
                <History className="h-3 w-3" />
                Recently deleted
              </button>
              <button
                type="button"
                onClick={() =>
                {
                  setOpen(false)
                  setShowRecentShares(true)
                }}
                className="focus-custom mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)]"
              >
                <LinkIcon className="h-3 w-3" />
                Recent shares
              </button>
            </div>
          )}
        </OverlayPanelSurface>
      )}

      <PresetPickerModal
        open={showPresetPicker}
        onClose={() => setShowPresetPicker(false)}
        onSelectPreset={(preset: TierPreset) =>
          createBoardSessionFromPreset(preset)
        }
        onSelectBlank={() => createBoardSession()}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete list?"
        description={
          cloudEnabled
            ? `"${boardToDelete?.title ?? ''}" will be moved to Recently deleted. You can restore it for 30 days.`
            : `"${boardToDelete?.title ?? ''}" will be permanently deleted.`
        }
        confirmText="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() =>
        {
          if (confirmDeleteId)
          {
            deleteBoardSession(confirmDeleteId)
            setConfirmDeleteId(null)
          }
        }}
      />

      {showRecentlyDeleted && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              aria-hidden
            />
          }
        >
          <RecentlyDeletedModal
            open={showRecentlyDeleted}
            onClose={() => setShowRecentlyDeleted(false)}
            enabled={cloudEnabled}
          />
        </Suspense>
      )}

      {showRecentShares && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              aria-hidden
            />
          }
        >
          <RecentSharesModal
            open={showRecentShares}
            onClose={() => setShowRecentShares(false)}
            enabled={cloudEnabled}
          />
        </Suspense>
      )}
    </>
  )
}
