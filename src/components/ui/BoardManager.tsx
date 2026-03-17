// src/components/ui/BoardManager.tsx
// floating bottom-right panel for switching between multiple tier lists

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Layers, Pencil, Plus, Trash2 } from 'lucide-react'

import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { usePopupClose } from '../../hooks/usePopupClose'
import { ConfirmDialog } from './ConfirmDialog'

interface BoardManagerProps
{
  onSwitchBoard: (boardId: string) => void
}

export const BoardManager = ({ onSwitchBoard }: BoardManagerProps) =>
{
  const boards = useBoardManagerStore((s) => s.boards)
  const activeBoardId = useBoardManagerStore((s) => s.activeBoardId)
  const createBoard = useBoardManagerStore((s) => s.createBoard)
  const deleteBoard = useBoardManagerStore((s) => s.deleteBoard)
  const duplicateBoard = useBoardManagerStore((s) => s.duplicateBoard)
  const renameBoard = useBoardManagerStore((s) => s.renameBoard)

  const [open, setOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement | null>(null)

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  usePopupClose({
    show: open,
    triggerRef,
    popupRef: panelRef,
    onClose: useCallback(() =>
    {
      setOpen(false)
      setEditingId(null)
    }, []),
  })

  // auto-focus the rename input when entering edit mode
  useEffect(() =>
  {
    if (editingId && editInputRef.current)
    {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const commitRename = () =>
  {
    if (editingId && editValue.trim())
    {
      renameBoard(editingId, editValue)
    }
    setEditingId(null)
  }

  const boardToDelete = confirmDeleteId
    ? boards.find((b) => b.id === confirmDeleteId)
    : null

  return (
    <>
      {/* collapsed trigger — icon pill w/ board count */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Board manager"
        title="Your Lists"
        onClick={() =>
        {
          if (!open) setOpen(true)
        }}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border border-white/12 bg-[#272727] px-3 py-2 text-sm text-slate-100 shadow-lg transition hover:border-white/22 hover:bg-[#2a2a2a]"
      >
        <Layers className="h-4 w-4" strokeWidth={1.8} />
        <span className="font-medium">{boards.length}</span>
      </button>

      {/* expanded panel — opens upward from the trigger */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-16 right-4 z-50 flex w-64 flex-col rounded-xl border border-[#444] bg-[#1e1e1e] shadow-2xl"
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-[#444] px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-100">
              Your Lists
            </span>
          </div>

          {/* board list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {boards.map((board) =>
            {
              const isActive = board.id === activeBoardId
              const isEditing = board.id === editingId
              return (
                <div
                  key={board.id}
                  className={`group flex items-center gap-2 px-3 py-2 transition ${
                    isActive ? 'bg-white/6' : 'hover:bg-white/4'
                  }`}
                >
                  {/* active indicator dot */}
                  <div
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isActive ? 'bg-sky-400' : 'bg-transparent'
                    }`}
                  />

                  {isEditing ? (
                    // inline rename input
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) =>
                        {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={commitRename}
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none"
                    />
                  ) : (
                    <>
                      {/* board title — click to switch */}
                      <button
                        type="button"
                        onClick={() =>
                          {
                          onSwitchBoard(board.id)
                          setOpen(false)
                        }}
                        className={`min-w-0 flex-1 truncate text-left text-sm ${
                          isActive
                            ? 'font-medium text-slate-100'
                            : 'text-[#aaa] hover:text-slate-100'
                        }`}
                      >
                        {board.title}
                      </button>

                      {/* edit, duplicate, & delete buttons — appear on hover */}
                      <button
                        type="button"
                        aria-label={`Rename ${board.title}`}
                        onClick={() =>
                          {
                          setEditingId(board.id)
                          setEditValue(board.title)
                        }}
                        className="shrink-0 rounded p-0.5 text-[#666] opacity-0 transition hover:text-slate-100 group-hover:opacity-100"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        aria-label={`Duplicate ${board.title}`}
                        onClick={() =>
                          {
                          duplicateBoard(board.id)
                          setOpen(false)
                        }}
                        className="shrink-0 rounded p-0.5 text-[#666] opacity-0 transition hover:text-slate-100 group-hover:opacity-100"
                      >
                        <Copy className="h-3 w-3" />
                      </button>

                      {boards.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Delete ${board.title}`}
                          onClick={() => setConfirmDeleteId(board.id)}
                          className="shrink-0 rounded p-0.5 text-[#666] opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
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

          {/* new list button */}
          <div className="border-t border-[#444] px-3 py-2">
            <button
              type="button"
              onClick={() =>
              {
                createBoard()
                setOpen(false)
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm text-[#aaa] transition hover:bg-white/6 hover:text-slate-100"
            >
              <Plus className="h-3.5 w-3.5" />
              New List
            </button>
          </div>
        </div>
      )}

      {/* confirm delete dialog */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete list?"
        description={`"${boardToDelete?.title ?? ''}" will be permanently deleted.`}
        confirmText="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() =>
        {
          if (confirmDeleteId)
          {
            deleteBoard(confirmDeleteId)
            setConfirmDeleteId(null)
          }
        }}
      />
    </>
  )
}
