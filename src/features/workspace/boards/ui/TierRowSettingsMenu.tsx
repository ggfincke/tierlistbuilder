// src/features/workspace/boards/ui/TierRowSettingsMenu.tsx
// gear button & popup settings menu for a tier row

import { useCallback, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings as SettingsIcon } from 'lucide-react'

import type { Tier } from '@/features/workspace/boards/model/contract'
import type { PaletteId } from '@/shared/types/theme'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { computeSettingsMenuStyle } from '@/shared/overlay/popupPosition'
import { useAnchoredPopup } from '@/shared/overlay/useAnchoredPopup'
import { ConfirmDialog } from '@/shared/overlay/ConfirmDialog'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '@/shared/overlay/OverlayPrimitives'
import { TextInput } from '@/shared/ui/TextInput'

interface TierRowSettingsMenuProps
{
  tier: Tier
  index: number
  paletteId: PaletteId
  // controlled visibility — TierRow owns state for mutual exclusion w/ color picker
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
  const renameTier = useActiveBoardStore((state) => state.renameTier)
  const deleteTier = useActiveBoardStore((state) => state.deleteTier)
  const clearTierItems = useActiveBoardStore((state) => state.clearTierItems)
  const addTierAt = useActiveBoardStore((state) => state.addTierAt)
  const setTierDescription = useActiveBoardStore(
    (state) => state.setTierDescription
  )
  const sortTierItemsByName = useActiveBoardStore(
    (state) => state.sortTierItemsByName
  )

  const [confirmDelete, setConfirmDelete] = useState(false)
  const gearButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const titleId = useId()
  const handleClose = useCallback(() => onClose(), [onClose])
  const { style: menuStyle } = useAnchoredPopup({
    open: show,
    triggerRef: gearButtonRef,
    popupRef: menuRef,
    onClose: handleClose,
    computePosition: () =>
      gearButtonRef.current
        ? computeSettingsMenuStyle(gearButtonRef.current)
        : null,
  })

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
            className="z-50 w-48 p-2"
            style={menuStyle}
          >
            <h2 id={titleId} className="sr-only">
              {tier.name} row settings
            </h2>
            <TextInput
              defaultValue={tier.name}
              onBlur={(e) =>
              {
                const val = e.currentTarget.value.trim()
                if (val && val !== tier.name) renameTier(tier.id, val)
              }}
              onKeyDown={(e) =>
              {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="mb-1.5 w-full rounded-lg border-[var(--t-border)] px-2 focus:border-[var(--t-accent-hover)]"
              aria-label="Rename tier"
            />

            <TextInput
              defaultValue={tier.description ?? ''}
              placeholder="Description (optional)"
              onBlur={(e) =>
              {
                const val = e.currentTarget.value
                if (val !== (tier.description ?? ''))
                  setTierDescription(tier.id, val)
              }}
              onKeyDown={(e) =>
              {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              size="xs"
              className="mb-2 w-full rounded-lg border-[var(--t-border)] px-2 text-[var(--t-text-secondary)] focus:border-[var(--t-accent-hover)]"
              aria-label="Tier description"
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
