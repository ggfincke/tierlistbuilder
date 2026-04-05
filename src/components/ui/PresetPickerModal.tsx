// src/components/ui/PresetPickerModal.tsx
// modal for choosing a board preset when creating a new list

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import type { PresetId, TierPreset } from '../../types'
import { BUILTIN_PRESETS } from '../../domain/presets'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useInlineEdit } from '../../hooks/useInlineEdit'
import { useModalBackgroundInert } from '../../hooks/useModalBackgroundInert'
import { usePresetStore } from '../../store/usePresetStore'
import { getTextColor } from '../../utils/color'
import { ConfirmDialog } from './ConfirmDialog'
import { SecondaryButton } from './SecondaryButton'
import { TextInput } from './TextInput'

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

  const dialogRef = useRef<HTMLDivElement>(null)
  const blankBoardButtonRef = useRef<HTMLButtonElement>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<PresetId | null>(null)
  const titleId = useId()
  const {
    cancelEdit,
    getInputProps,
    inputRef: editInputRef,
    isEditing,
    startEdit,
  } = useInlineEdit<PresetId>({
    onCommit: renamePreset,
  })

  const allPresets = useMemo(
    () => [...BUILTIN_PRESETS, ...userPresets],
    [userPresets]
  )
  const handleClose = useCallback(() =>
  {
    cancelEdit()
    setConfirmDeleteId(null)
    onClose()
  }, [cancelEdit, onClose])

  useDismissibleLayer({
    open,
    onDismiss: handleClose,
    closeOnInteractOutside: false,
  })

  useFocusTrap(dialogRef, {
    active: open,
    initialFocusRef: blankBoardButtonRef,
  })
  useModalBackgroundInert(open)

  if (!open)
  {
    return null
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 animate-[fadeIn_100ms_ease-out]"
        onClick={handleClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-50 m-auto flex h-[min(34rem,calc(100vh-4rem))] w-full max-w-4xl flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl animate-[scaleIn_150ms_ease-out]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id={titleId}
            className="text-lg font-semibold text-[var(--t-text)]"
          >
            New List
          </h2>
          <SecondaryButton size="sm" onClick={handleClose}>
            Cancel
          </SecondaryButton>
        </div>

        <div className="min-h-0 flex-1 grid grid-cols-4 gap-2 overflow-y-auto pr-1 auto-rows-min">
          {/* blank board option */}
          <button
            ref={blankBoardButtonRef}
            type="button"
            onClick={() =>
            {
              onSelectBlank()
              handleClose()
            }}
            className="focus-custom group flex min-h-[6rem] flex-col gap-2 rounded-lg border border-dashed border-[var(--t-border-secondary)] px-3 py-3 text-left transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
                <Plus className="h-3.5 w-3.5 text-[var(--t-text-muted)]" />
              </div>
              <span className="text-sm font-medium text-[var(--t-text)]">
                Blank Board
              </span>
            </div>
            <p className="text-xs text-[var(--t-text-muted)]">
              No tiers — start from scratch
            </p>
          </button>

          {/* preset list */}
          {allPresets.map((preset) =>
          {
            const presetIsEditing = isEditing(preset.id)
            const previewPills = (
              <div className="mt-1 flex flex-wrap gap-1">
                {preset.tiers.map((tier, i) =>
                {
                  const tierColor = resolveTierColorSpec(
                    paletteId,
                    tier.colorSpec
                  )
                  const tierTextColor = getTextColor(tierColor)

                  return (
                    <span
                      key={i}
                      className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium leading-none"
                      style={{
                        backgroundColor: tierColor,
                        color: tierTextColor,
                        textShadow:
                          tierTextColor === '#ffffff'
                            ? '0 0 2px rgba(0,0,0,0.4)'
                            : '0 0 2px rgba(255,255,255,0.35)',
                      }}
                    >
                      {tier.name}
                    </span>
                  )
                })}
              </div>
            )

            return (
              <div
                key={preset.id}
                className="group relative flex min-h-[6rem] flex-col rounded-lg border border-[var(--t-border)] px-3 py-3 transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-within:border-[var(--t-border-hover)] focus-within:bg-[var(--t-bg-hover)]"
              >
                {presetIsEditing ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                    <TextInput
                      ref={editInputRef}
                      variant="ghost"
                      size="sm"
                      {...getInputProps({
                        'aria-label': `Rename ${preset.name}`,
                        className:
                          'w-full rounded px-0 py-0 font-medium focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]',
                      })}
                    />
                    {previewPills}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="focus-custom flex min-w-0 flex-1 flex-col gap-1.5 rounded text-left focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                    onClick={() =>
                      {
                      onSelectPreset(preset)
                      handleClose()
                    }}
                  >
                    <span className="text-sm font-medium text-[var(--t-text)]">
                      {preset.name}
                    </span>
                    {previewPills}
                  </button>
                )}

                {/* actions for user presets */}
                {!preset.builtIn && !presetIsEditing && (
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={`Rename ${preset.name}`}
                      onClick={() => startEdit(preset.id, preset.name)}
                      className="focus-custom rounded p-1 text-[var(--t-text-dim)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${preset.name}`}
                      onClick={() => setConfirmDeleteId(preset.id)}
                      className="focus-custom rounded p-1 text-[var(--t-text-dim)] hover:text-[var(--t-destructive-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
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
    </>,
    document.body
  )
}
