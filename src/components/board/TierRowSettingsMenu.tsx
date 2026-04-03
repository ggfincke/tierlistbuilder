// src/components/board/TierRowSettingsMenu.tsx
// gear button & popup settings menu for a tier row

import { useCallback, useRef, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'

import type { PaletteId, Tier } from '../../types'
import { useTierListStore } from '../../store/useTierListStore'
import { computeSettingsMenuStyle } from '../../utils/popupPosition'
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition'
import { usePopupClose } from '../../hooks/usePopupClose'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { OverlayMenuItem, OverlayMenuSurface } from '../ui/OverlayPrimitives'

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
  const renameTier = useTierListStore((state) => state.renameTier)
  const deleteTier = useTierListStore((state) => state.deleteTier)
  const clearTierItems = useTierListStore((state) => state.clearTierItems)
  const addTierAt = useTierListStore((state) => state.addTierAt)
  const setTierDescription = useTierListStore(
    (state) => state.setTierDescription
  )
  const sortTierItemsByName = useTierListStore(
    (state) => state.sortTierItemsByName
  )

  const [confirmDelete, setConfirmDelete] = useState(false)
  const gearButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { style: menuStyle, updatePosition: updateMenuPosition } =
    useAnchoredPosition({
      computePosition: () =>
        gearButtonRef.current
          ? computeSettingsMenuStyle(gearButtonRef.current)
          : null,
    })

  usePopupClose({
    show,
    triggerRef: gearButtonRef,
    popupRef: menuRef,
    onClose: useCallback(() => onClose(), [onClose]),
    onScroll: updateMenuPosition,
  })

  return (
    <>
      <button
        ref={gearButtonRef}
        type="button"
        className="focus-custom rounded p-1 text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] max-sm:p-2"
        onClick={() =>
        {
          if (!show && gearButtonRef.current)
          {
            updateMenuPosition()
            onToggle()
          }
        }}
        aria-label="Row settings"
        aria-haspopup="menu"
        aria-expanded={show}
      >
        <SettingsIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>

      {show && (
        <OverlayMenuSurface
          ref={menuRef}
          role="menu"
          className="z-50 w-48 p-2"
          style={menuStyle}
        >
          <input
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
            className="mb-1.5 w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-1.5 text-sm text-[var(--t-text)] outline-none focus:border-[var(--t-accent-hover)]"
            aria-label="Rename tier"
          />

          <input
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
            className="mb-2 w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-1.5 text-xs text-[var(--t-text-secondary)] outline-none focus:border-[var(--t-accent-hover)]"
            aria-label="Tier description"
          />

          <OverlayMenuItem
            role="menuitem"
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
            role="menuitem"
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
            role="menuitem"
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
            role="menuitem"
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
            role="menuitem"
            className="text-sm"
            onClick={() =>
            {
              addTierAt(index + 1, paletteId)
              onClose()
            }}
          >
            Add a Row Below
          </OverlayMenuItem>
        </OverlayMenuSurface>
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
