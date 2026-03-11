// src/components/settings/TierSettings.tsx
// settings panel — image import, text item creation, deleted items, & tier management
import { RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useTierListStore } from '../../store/useTierListStore'
import { getTextColor } from '../../utils/color'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ImageUploader } from './ImageUploader'

interface TierSettingsProps {
  // controls panel visibility
  open: boolean
  // called when the user closes the panel
  onClose: () => void
}

export const TierSettings = ({ open, onClose }: TierSettingsProps) => {
  const addTextItem = useTierListStore((state) => state.addTextItem)
  const deletedItems = useTierListStore((state) => state.deletedItems)
  const restoreDeletedItem = useTierListStore((state) => state.restoreDeletedItem)
  const permanentlyDeleteItem = useTierListStore((state) => state.permanentlyDeleteItem)
  const clearDeletedItems = useTierListStore((state) => state.clearDeletedItems)
  const [textLabel, setTextLabel] = useState('')
  const [textColor, setTextColor] = useState('#ffbf7f')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // render nothing when closed to avoid mounting the uploader unnecessarily
  if (!open) {
    return null
  }

  const handleAddTextItem = () => {
    const trimmed = textLabel.trim()
    if (!trimmed) {
      return
    }
    addTextItem(trimmed, textColor)
    setTextLabel('')
  }

  return (
    <>
      {/* backdrop — click to close */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      <div className="fixed inset-0 z-50 m-auto flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col rounded-xl border border-[#444] bg-[#1e1e1e] p-4 shadow-2xl" style={{ height: 'fit-content' }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Tier Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#555] px-3 py-1 text-sm text-slate-200 hover:border-[#777]"
          >
            Done
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {/* image import section */}
          <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-slate-100">Import Images</h3>
              <p className="mt-1 text-xs text-[#999]">Drop files here or choose them from your computer.</p>
            </div>
            <ImageUploader />
          </section>

          {/* text-only item creation */}
          <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-100">Add Text Item</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={textLabel}
                onChange={(e) => setTextLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddTextItem()
                  }
                }}
                placeholder="Label"
                className="min-w-0 flex-1 rounded-md border border-[#555] bg-[#2b2b2b] px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-[#888] outline-none focus:border-[#777]"
              />
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[#555] bg-transparent"
              />
              <button
                type="button"
                disabled={!textLabel.trim()}
                onClick={handleAddTextItem}
                className="rounded-md border border-[#555] bg-[#2b2b2b] px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-[#777] hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Add
              </button>
            </div>
          </section>

          {/* recently deleted items — only shown when there are deleted items */}
          {deletedItems.length > 0 && (
            <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  Recently Deleted
                  <span className="ml-1.5 font-normal text-[#888]">({deletedItems.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-1 text-xs text-[#888] hover:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {deletedItems.map((item) => {
                  const bgColor = item.backgroundColor ?? '#444'
                  return (
                    <div
                      key={item.id}
                      className="group relative h-16 w-16 shrink-0 overflow-hidden rounded opacity-70"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.label ?? 'Deleted item'}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center p-0.5"
                          style={{ backgroundColor: bgColor, color: getTextColor(bgColor) }}
                        >
                          <span className="text-[10px] font-semibold break-words text-center leading-tight [overflow-wrap:anywhere]">
                            {item.label}
                          </span>
                        </div>
                      )}
                      {/* hover overlay — restore (bottom-left) & permanent delete (top-right) */}
                      <div className="absolute inset-0 flex items-end justify-start bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label={`Restore ${item.label ?? 'item'}`}
                          className="flex h-5 w-5 items-center justify-center rounded-tr-md bg-black/60 text-white hover:text-green-400"
                          onClick={() => restoreDeletedItem(item.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Permanently delete ${item.label ?? 'item'}`}
                        className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                        onClick={() => permanentlyDeleteItem(item.id)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

        </div>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear deleted items?"
        description="This will permanently remove all deleted items. This cannot be undone."
        confirmText="Clear all"
        onConfirm={() => {
          clearDeletedItems()
          setShowClearConfirm(false)
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  )
}
