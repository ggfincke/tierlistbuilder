import { useCallback, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Settings as SettingsIcon } from 'lucide-react'

import type { Tier } from '../../types'
import { useTierListStore } from '../../store/useTierListStore'
import { usePopupClose } from '../../hooks/usePopupClose'
import { TierItem } from './TierItem'
import { TierLabel } from './TierLabel'
import { ColorPicker } from './ColorPicker'
import { ConfirmDialog } from '../ui/ConfirmDialog'

interface TierRowProps {
  tier: Tier
  index: number
  totalTiers: number
}

function computeColorPickerStyle(btn: HTMLButtonElement): CSSProperties {
  const rect = btn.getBoundingClientRect()
  return {
    position: 'fixed',
    top: rect.bottom + 8,
    right: window.innerWidth - rect.right,
  }
}

function computeSettingsMenuStyle(btn: HTMLButtonElement): CSSProperties {
  const rect = btn.getBoundingClientRect()
  const menuHeight = 230
  const spaceBelow = window.innerHeight - rect.bottom
  if (spaceBelow >= menuHeight + 8) {
    return {
      position: 'fixed',
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    }
  }
  return {
    position: 'fixed',
    bottom: window.innerHeight - rect.top + 8,
    right: window.innerWidth - rect.right,
  }
}

export const TierRow = ({ tier, index, totalTiers }: TierRowProps) => {
  const reorderTier = useTierListStore((state) => state.reorderTier)
  const recolorTier = useTierListStore((state) => state.recolorTier)
  const deleteTier = useTierListStore((state) => state.deleteTier)
  const clearTierItems = useTierListStore((state) => state.clearTierItems)
  const addTierAt = useTierListStore((state) => state.addTierAt)
  const renameTier = useTierListStore((state) => state.renameTier)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [colorPickerStyle, setColorPickerStyle] = useState<CSSProperties>({})
  const [settingsMenuStyle, setSettingsMenuStyle] = useState<CSSProperties>({})

  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const gearButtonRef = useRef<HTMLButtonElement>(null)
  const settingsMenuRef = useRef<HTMLDivElement>(null)

  const { setNodeRef, isOver } = useDroppable({
    id: tier.id,
    data: { type: 'container', containerId: tier.id },
  })

  usePopupClose({
    show: showColorPicker,
    triggerRef: colorButtonRef,
    popupRef: colorPickerRef,
    onClose: useCallback(() => setShowColorPicker(false), []),
    onScroll: useCallback(() => {
      if (colorButtonRef.current) {
        setColorPickerStyle(computeColorPickerStyle(colorButtonRef.current))
      }
    }, []),
  })

  usePopupClose({
    show: showSettingsMenu,
    triggerRef: gearButtonRef,
    popupRef: settingsMenuRef,
    onClose: useCallback(() => setShowSettingsMenu(false), []),
    onScroll: useCallback(() => {
      if (gearButtonRef.current) {
        setSettingsMenuStyle(computeSettingsMenuStyle(gearButtonRef.current))
      }
    }, []),
  })

  return (
    <div>
      <div
        className={`flex border-b border-[#444] transition-colors ${
          isOver ? 'bg-[#323232]' : 'bg-[#2b2b2b]'
        }`}
      >
        <TierLabel tier={tier} />

        <SortableContext items={tier.itemIds} strategy={rectSortingStrategy}>
          <div
            ref={setNodeRef}
            data-testid={`tier-container-${tier.id}`}
            data-tier-id={tier.id}
            className="flex min-h-[104px] flex-1 flex-wrap content-start gap-px bg-[#2b2b2b] p-0"
          >
            {tier.itemIds.map((itemId) => (
              <TierItem key={itemId} itemId={itemId} containerId={tier.id} />
            ))}
          </div>
        </SortableContext>

        <div className="flex shrink-0 items-center gap-1 border-l border-[#444] bg-[#232323] px-1.5">
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              type="button"
              className="rounded px-1 py-0.5 text-xs text-[#999] hover:text-white disabled:opacity-30"
              disabled={index === 0}
              onClick={() => reorderTier(tier.id, 'up')}
              aria-label="Move tier up"
            >
              ▲
            </button>

            <button
              ref={colorButtonRef}
              type="button"
              className="h-4 w-4 rounded-full border border-[#555]"
              style={{ backgroundColor: tier.color }}
              onClick={() => {
                if (!showColorPicker && colorButtonRef.current) {
                  setColorPickerStyle(computeColorPickerStyle(colorButtonRef.current))
                  setShowColorPicker(true)
                  setShowSettingsMenu(false)
                }
              }}
              aria-label="Change tier color"
            />

            <button
              type="button"
              className="rounded px-1 py-0.5 text-xs text-[#999] hover:text-white disabled:opacity-30"
              disabled={index === totalTiers - 1}
              onClick={() => reorderTier(tier.id, 'down')}
              aria-label="Move tier down"
            >
              ▼
            </button>
          </div>

          <div>
            <button
              ref={gearButtonRef}
              type="button"
              className="rounded p-1 text-[#999] hover:text-white"
              onClick={() => {
                if (!showSettingsMenu && gearButtonRef.current) {
                  setSettingsMenuStyle(computeSettingsMenuStyle(gearButtonRef.current))
                  setShowSettingsMenu(true)
                  setShowColorPicker(false)
                }
              }}
              aria-label="Row settings"
              aria-haspopup="menu"
              aria-expanded={showSettingsMenu}
            >
              <SettingsIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      {showColorPicker && (
        <div
          ref={colorPickerRef}
          className="z-50 rounded-lg border border-[#555] bg-[#232323] shadow-lg"
          style={colorPickerStyle}
        >
          <ColorPicker
            value={tier.color}
            onChange={(color) => {
              recolorTier(tier.id, color)
              setShowColorPicker(false)
            }}
          />
        </div>
      )}

      {showSettingsMenu && (
        <div
          ref={settingsMenuRef}
          role="menu"
          className="z-50 w-48 rounded-xl border border-white/12 bg-[#1e1e1e] p-2 shadow-2xl"
          style={settingsMenuStyle}
        >
          <input
            defaultValue={tier.name}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim()
              if (val && val !== tier.name) renameTier(tier.id, val)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="mb-2 w-full rounded-lg border border-[#444] bg-[#2b2b2b] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400"
            aria-label="Rename tier"
          />

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-rose-400 transition hover:bg-white/6"
            onClick={() => {
              setShowSettingsMenu(false)
              setConfirmDelete(true)
            }}
          >
            Delete Row
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/6"
            onClick={() => {
              clearTierItems(tier.id)
              setShowSettingsMenu(false)
            }}
          >
            Clear Row Images
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/6"
            onClick={() => {
              addTierAt(index)
              setShowSettingsMenu(false)
            }}
          >
            Add a Row Above
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/6"
            onClick={() => {
              addTierAt(index + 1)
              setShowSettingsMenu(false)
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
        onConfirm={() => {
          deleteTier(tier.id)
          setConfirmDelete(false)
        }}
      />
    </div>
  )
}
