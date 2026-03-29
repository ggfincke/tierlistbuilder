// src/components/board/TierRowSettingsMenu.tsx
// gear button & popup settings menu for a tier row

import { useCallback, useRef, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'

import type { Tier } from '../../types'
import { useTierListStore } from '../../store/useTierListStore'
import { computeSettingsMenuStyle } from '../../utils/popupPosition'
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition'
import { usePopupClose } from '../../hooks/usePopupClose'
import { ConfirmDialog } from '../ui/ConfirmDialog'

interface TierRowSettingsMenuProps
{
  tier: Tier
  index: number
  // controlled visibility — TierRow owns state for mutual exclusion w/ color picker
  show: boolean
  onToggle: () => void
  onClose: () => void
}

export const TierRowSettingsMenu = ({
  tier,
  index,
  show,
  onToggle,
  onClose,
}: TierRowSettingsMenuProps) =>
{
  const renameTier = useTierListStore((state) => state.renameTier)
  const deleteTier = useTierListStore((state) => state.deleteTier)
  const clearTierItems = useTierListStore((state) => state.clearTierItems)
  const addTierAt = useTierListStore((state) => state.addTierAt)

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
        className="rounded p-1 text-[var(--t-text-faint)] hover:text-[var(--t-text)]"
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
        <div
          ref={menuRef}
          role="menu"
          className="z-50 w-48 rounded-xl border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-overlay)] p-2 shadow-2xl"
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
            className="mb-2 w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-1.5 text-sm text-[var(--t-text)] outline-none focus:border-[var(--t-accent-hover)]"
            aria-label="Rename tier"
          />

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--t-destructive-hover)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
            onClick={() =>
            {
              onClose()
              setConfirmDelete(true)
            }}
          >
            Delete Row
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
            onClick={() =>
            {
              clearTierItems(tier.id)
              onClose()
            }}
          >
            Clear Row Images
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
            onClick={() =>
            {
              addTierAt(index)
              onClose()
            }}
          >
            Add a Row Above
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
            onClick={() =>
            {
              addTierAt(index + 1)
              onClose()
            }}
          >
            Add a Row Below
          </button>
        </div>
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
