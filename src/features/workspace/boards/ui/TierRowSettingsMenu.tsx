// src/features/workspace/boards/ui/TierRowSettingsMenu.tsx
// gear button & popup settings menu for a tier row

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { Settings as SettingsIcon } from 'lucide-react'

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useInlineEdit } from '~/shared/hooks/useInlineEdit'
import { computeSettingsMenuStyle } from '~/shared/overlay/popupPosition'
import { useAnchoredPopup } from '~/shared/overlay/anchoredPopup'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

import { TextInput } from '~/shared/ui/TextInput'

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
  } = useActiveBoardStore(
    useShallow((state) => ({
      renameTier: state.renameTier,
      deleteTier: state.deleteTier,
      clearTierItems: state.clearTierItems,
      addTierAt: state.addTierAt,
      setTierDescription: state.setTierDescription,
      sortTierItemsByName: state.sortTierItemsByName,
    }))
  )

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
