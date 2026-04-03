// src/components/ui/PresetPickerModal.tsx
// modal for choosing a board preset when creating a new list

import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import type { TierPreset } from '../../types'
import { BUILTIN_PRESETS } from '../../domain/presets'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { usePresetStore } from '../../store/usePresetStore'
import { ConfirmDialog } from './ConfirmDialog'

interface PresetPickerModalProps
{
  open: boolean
  onClose: () => void
  onSelectPreset: (preset: TierPreset) => void
  onSelectBlank: () => void
}

export const PresetPickerModal = ({
  open,
  onClose,
  onSelectPreset,
  onSelectBlank,
}: PresetPickerModalProps) =>
{
  const paletteId = useCurrentPaletteId()
  const userPresets = usePresetStore((state) => state.userPresets)
  const removePreset = usePresetStore((state) => state.removePreset)
  const renamePreset = usePresetStore((state) => state.renamePreset)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const allPresets = useMemo(
    () => [...BUILTIN_PRESETS, ...userPresets],
    [userPresets]
  )

  useDismissibleLayer({
    open,
    onDismiss: onClose,
    closeOnInteractOutside: false,
  })

  if (!open)
  {
    return null
  }

  const commitRename = () =>
  {
    if (editingId && editValue.trim())
    {
      renamePreset(editingId, editValue)
    }
    setEditingId(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 animate-[fadeIn_100ms_ease-out]" onClick={onClose} />

      <div className="fixed inset-0 z-50 m-auto flex h-[min(34rem,calc(100vh-4rem))] w-full max-w-4xl flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl animate-[scaleIn_150ms_ease-out]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--t-text)]">
            New List
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--t-border-secondary)] px-3 py-1 text-sm text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]"
          >
            Cancel
          </button>
        </div>

        <div className="min-h-0 flex-1 grid grid-cols-4 gap-2 overflow-y-auto pr-1 auto-rows-min">
          {/* blank board option */}
          <button
            type="button"
            onClick={() =>
            {
              onSelectBlank()
              onClose()
            }}
            className="group flex min-h-[6rem] flex-col gap-2 rounded-lg border border-dashed border-[var(--t-border-secondary)] px-3 py-3 text-left transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)]"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
                <Plus className="h-3.5 w-3.5 text-[var(--t-text-muted)]" />
              </div>
              <span className="text-sm font-medium text-[var(--t-text)]">
                Blank Board
              </span>
            </div>
            <p className="text-xs text-[var(--t-text-faint)]">
              No tiers — start from scratch
            </p>
          </button>

          {/* preset list */}
          {allPresets.map((preset) =>
          {
            const isEditing = editingId === preset.id

            return (
              <div
                key={preset.id}
                className="group relative flex min-h-[6rem] flex-col rounded-lg border border-[var(--t-border)] px-3 py-3 transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)]"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
                  onClick={() =>
                  {
                    if (!isEditing)
                    {
                      onSelectPreset(preset)
                      onClose()
                    }
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) =>
                        {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={commitRename}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-transparent text-sm font-medium text-[var(--t-text)] outline-none"
                    />
                  ) : (
                    <span className="text-sm font-medium text-[var(--t-text)]">
                      {preset.name}
                    </span>
                  )}

                  {/* tier color preview pills */}
                  <div className="flex flex-wrap gap-1">
                    {preset.tiers.map((tier, i) => (
                      <span
                        key={i}
                        className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium leading-none"
                        style={{
                          backgroundColor: resolveTierColorSpec(
                            paletteId,
                            tier.colorSpec
                          ),
                          color: '#fff',
                          textShadow: '0 0 2px rgba(0,0,0,0.4)',
                        }}
                      >
                        {tier.name}
                      </span>
                    ))}
                  </div>
                </button>

                {/* actions for user presets */}
                {!preset.builtIn && !isEditing && (
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`Rename ${preset.name}`}
                      onClick={(e) =>
                      {
                        e.stopPropagation()
                        setEditingId(preset.id)
                        setEditValue(preset.name)
                      }}
                      className="rounded p-1 text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${preset.name}`}
                      onClick={(e) =>
                      {
                        e.stopPropagation()
                        setConfirmDeleteId(preset.id)
                      }}
                      className="rounded p-1 text-[var(--t-text-dim)] hover:text-[var(--t-destructive-hover)]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete preset?"
        description="This preset will be permanently deleted."
        confirmText="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() =>
        {
          if (confirmDeleteId) removePreset(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
      />
    </>
  )
}
