// src/features/workspace/tier-presets/ui/PresetPickerModal.tsx
// modal for choosing a board preset when creating a new list

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { PresetId } from '@tierlistbuilder/contracts/lib/ids'
import { BUILTIN_PRESETS } from '@/features/workspace/tier-presets/model/tierPresets'
import { resolveTierColorSpec } from '@/shared/theme/tierColors'
import { useCurrentPaletteId } from '@/features/workspace/settings/model/useCurrentPaletteId'
import { useInlineEdit } from '@/shared/hooks/useInlineEdit'
import { useTierPresetStore } from '@/features/workspace/tier-presets/model/useTierPresetStore'
import { getContrastingTextShadow, getTextColor } from '@/shared/lib/color'
import { BaseModal } from '@/shared/overlay/BaseModal'
import { ConfirmDialog } from '@/shared/overlay/ConfirmDialog'
import { SecondaryButton } from '@/shared/ui/SecondaryButton'
import { TextInput } from '@/shared/ui/TextInput'

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
  const userPresets = useTierPresetStore((state) => state.userPresets)
  const removePreset = useTierPresetStore((state) => state.removePreset)
  const renamePreset = useTierPresetStore((state) => state.renamePreset)

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

  return (
    <>
      <BaseModal
        open={open}
        onClose={handleClose}
        labelledBy={titleId}
        initialFocusRef={blankBoardButtonRef}
        panelClassName="flex h-[min(34rem,calc(100vh-4rem))] w-full max-w-4xl flex-col p-4"
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

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-2 overflow-y-auto pr-1">
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

          {allPresets.map((preset) =>
          {
            const presetIsEditing = isEditing(preset.id)
            const previewPills = (
              <div className="mt-1 flex flex-wrap gap-1">
                {preset.tiers.map((tier, index) =>
                {
                  const tierColor = resolveTierColorSpec(
                    paletteId,
                    tier.colorSpec
                  )
                  const tierTextColor = getTextColor(tierColor)

                  return (
                    <span
                      key={index}
                      className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium leading-none"
                      style={{
                        backgroundColor: tierColor,
                        color: tierTextColor,
                        textShadow: getContrastingTextShadow(tierColor),
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
      </BaseModal>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete preset?"
        description="This preset will be permanently deleted."
        confirmText="Delete"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() =>
        {
          if (confirmDeleteId)
          {
            removePreset(confirmDeleteId)
          }

          setConfirmDeleteId(null)
        }}
      />
    </>
  )
}
