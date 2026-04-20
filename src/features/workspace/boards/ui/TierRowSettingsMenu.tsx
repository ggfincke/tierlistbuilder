// src/features/workspace/boards/ui/TierRowSettingsMenu.tsx
// gear button & popup settings menu for a tier row

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { Settings as SettingsIcon, X as ClearIcon } from 'lucide-react'

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import type {
  PaletteId,
  TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useInlineEdit } from '~/shared/hooks/useInlineEdit'
import { computeSettingsMenuStyle } from '~/shared/overlay/popupPosition'
import { useAnchoredPopup } from '~/shared/overlay/menu'
import {
  ConfirmDialog,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/Modal'

import { TextInput } from '~/shared/ui/TextInput'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
  getPaletteColors,
  resolveTierColorSpec,
} from '~/shared/theme/tierColors'
import { normalizeHexColor } from '~/shared/lib/color'
import { getColorName } from '~/shared/lib/colorName'

const NAME_EDITOR_ID = 'name'
const DESCRIPTION_EDITOR_ID = 'description'

interface TierRowSettingsMenuProps
{
  tier: Tier
  index: number
  paletteId: PaletteId
  show: boolean
  onToggle: () => void
  onClose: () => void
}

export const TierRowSettingsMenu = ({
  tier,
  index,
  paletteId,
  show,
  onToggle,
  onClose,
}: TierRowSettingsMenuProps) =>
{
  const {
    renameTier,
    deleteTier,
    clearTierItems,
    addTierAt,
    setTierDescription,
    sortTierItemsByName,
    recolorTierRow,
  } = useActiveBoardStore(
    useShallow((state) => ({
      renameTier: state.renameTier,
      deleteTier: state.deleteTier,
      clearTierItems: state.clearTierItems,
      addTierAt: state.addTierAt,
      setTierDescription: state.setTierDescription,
      sortTierItemsByName: state.sortTierItemsByName,
      recolorTierRow: state.recolorTierRow,
    }))
  )

  const paletteColors = useMemo(() => getPaletteColors(paletteId), [paletteId])
  const rowColor = tier.rowColorSpec
    ? resolveTierColorSpec(paletteId, tier.rowColorSpec)
    : null
  const [hexError, setHexError] = useState(false)

  const applyRowColor = (colorSpec: TierColorSpec | null) =>
  {
    setHexError(false)
    recolorTierRow(tier.id, colorSpec)
  }

  const applyHexValue = (value: string) =>
  {
    const trimmed = value.trim()
    if (trimmed === '')
    {
      setHexError(false)
      applyRowColor(null)
      return
    }
    const normalized = normalizeHexColor(trimmed)
    if (!normalized)
    {
      setHexError(true)
      return
    }
    setHexError(false)
    applyRowColor(createCustomTierColorSpec(normalized))
  }

  const currentPaletteIndex =
    tier.rowColorSpec && tier.rowColorSpec.kind === 'palette'
      ? tier.rowColorSpec.index
      : -1

  const [confirmDelete, setConfirmDelete] = useState(false)
  const gearButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const titleId = useId()
  const { style: menuStyle } = useAnchoredPopup({
    open: show,
    triggerRef: gearButtonRef,
    popupRef: menuRef,
    onClose,
    computePosition: () =>
      gearButtonRef.current
        ? computeSettingsMenuStyle(gearButtonRef.current)
        : null,
  })

  // separate inline-edit hooks for the name & description fields; both commit
  // on blur or Enter & cancel on Escape
  const {
    getInputProps: getNameInputProps,
    inputRef: nameInputRef,
    startEdit: startNameEdit,
  } = useInlineEdit<typeof NAME_EDITOR_ID>({
    onCommit: (_id, value) => renameTier(tier.id, value),
  })
  const {
    getInputProps: getDescriptionInputProps,
    startEdit: startDescriptionEdit,
  } = useInlineEdit<typeof DESCRIPTION_EDITOR_ID>({
    onCommit: (_id, value) => setTierDescription(tier.id, value),
    normalizeValue: (value) => value,
  })

  // start both editors when the menu opens so blur-commit always has a draft
  useEffect(() =>
  {
    if (show)
    {
      startNameEdit(NAME_EDITOR_ID, tier.name)
      startDescriptionEdit(DESCRIPTION_EDITOR_ID, tier.description ?? '')
    }
  }, [
    show,
    startDescriptionEdit,
    startNameEdit,
    tier.description,
    tier.id,
    tier.name,
  ])

  return (
    <>
      <button
        ref={gearButtonRef}
        type="button"
        className="focus-custom rounded p-1 text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] max-sm:p-2"
        onClick={() =>
        {
          if (show)
          {
            onClose()
            return
          }

          onToggle()
        }}
        aria-label="Row settings"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={show}
      >
        <SettingsIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>

      {show &&
        createPortal(
          <OverlayMenuSurface
            id={dialogId}
            ref={menuRef}
            role="dialog"
            aria-labelledby={titleId}
            className="z-50 w-56 p-2"
            style={menuStyle}
          >
            <h2 id={titleId} className="sr-only">
              {tier.name} row settings
            </h2>
            <TextInput
              {...getNameInputProps({
                'aria-label': 'Rename tier',
                className:
                  'mb-1.5 w-full rounded-lg border-[var(--t-border)] px-2 focus:border-[var(--t-accent-hover)]',
              })}
              ref={nameInputRef}
            />

            <TextInput
              {...getDescriptionInputProps({
                placeholder: 'Description (optional)',
                'aria-label': 'Tier description',
                className:
                  'mb-2 w-full rounded-lg border-[var(--t-border)] px-2 text-[var(--t-text-secondary)] focus:border-[var(--t-accent-hover)]',
              })}
              size="xs"
            />

            {/* row background color — palette swatches + hex input */}
            <div className="mb-2 rounded-lg border border-[var(--t-border)] p-1.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--t-text-faint)]">
                  Row Background
                </span>
                {rowColor && (
                  <button
                    type="button"
                    onClick={() => applyRowColor(null)}
                    aria-label="Clear row background"
                    className="focus-custom flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                  >
                    <ClearIcon className="h-2.5 w-2.5" strokeWidth={2} />
                    None
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {paletteColors.map((color, swatchIndex) =>
                {
                  const isSelected = swatchIndex === currentPaletteIndex
                  return (
                    <button
                      key={`${swatchIndex}-${color}`}
                      type="button"
                      className={`focus-custom h-4 w-4 rounded-full transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
                        isSelected
                          ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                          : ''
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        applyRowColor(createPaletteTierColorSpec(swatchIndex))
                      }
                      aria-label={`Row background ${getColorName(color)}`}
                      aria-pressed={isSelected}
                    />
                  )
                })}
              </div>
              <TextInput
                key={`${tier.id}-${rowColor ?? 'none'}`}
                defaultValue={rowColor ?? ''}
                onChange={() => setHexError(false)}
                onBlur={(e) => applyHexValue(e.currentTarget.value)}
                onKeyDown={(e) =>
                {
                  if (e.key === 'Enter')
                  {
                    e.preventDefault()
                    applyHexValue(e.currentTarget.value)
                  }
                }}
                placeholder="#aabbcc"
                aria-label="Custom row background hex"
                aria-invalid={hexError || undefined}
                className={`mt-1.5 w-full rounded-lg px-2 focus:border-[var(--t-accent-hover)] ${
                  hexError
                    ? 'border-[var(--t-destructive)]'
                    : 'border-[var(--t-border)]'
                }`}
                size="xs"
                spellCheck={false}
              />
            </div>

            <OverlayMenuItem
              className="text-sm text-[var(--t-destructive-hover)]"
              onClick={() =>
              {
                onClose()
                setConfirmDelete(true)
              }}
            >
              Delete Row
            </OverlayMenuItem>

            <OverlayMenuItem
              className="text-sm"
              onClick={() =>
              {
                clearTierItems(tier.id)
                onClose()
              }}
            >
              Clear Row Images
            </OverlayMenuItem>

            <OverlayMenuItem
              className="text-sm"
              onClick={() =>
              {
                sortTierItemsByName(tier.id)
                onClose()
              }}
            >
              Sort A-Z
            </OverlayMenuItem>

            <OverlayMenuItem
              className="text-sm"
              onClick={() =>
              {
                addTierAt(index, paletteId)
                onClose()
              }}
            >
              Add a Row Above
            </OverlayMenuItem>

            <OverlayMenuItem
              className="text-sm"
              onClick={() =>
              {
                addTierAt(index + 1, paletteId)
                onClose()
              }}
            >
              Add a Row Below
            </OverlayMenuItem>
          </OverlayMenuSurface>,
          document.body
        )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete tier?"
        description={`Items in "${tier.name}" will be moved to Unranked.`}
        confirmText="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
        {
          deleteTier(tier.id)
          setConfirmDelete(false)
        }}
      />
    </>
  )
}
