// src/components/settings/PalettePicker.tsx
// grid of clickable palette preview cards for the Appearance section

import { useRef } from 'react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { PALETTE_META, PALETTES } from '../../theme'
import type { PaletteId } from '../../types'
import {
  resolveNextSelectionIndex,
  type SelectionNavigationKey,
} from '../../utils/selectionNavigation'

interface PalettePickerProps
{
  ariaLabelledby?: string
}

export const PalettePicker = ({ ariaLabelledby }: PalettePickerProps) =>
{
  const paletteId = useSettingsStore((s) => s.paletteId)
  const setPaletteId = useSettingsStore((s) => s.setPaletteId)
  const optionRefs = useRef<
    Partial<Record<PaletteId, HTMLButtonElement | null>>
  >({})

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabelledby ? undefined : 'Tier color palette'}
      className="grid grid-cols-4 gap-2"
    >
      {PALETTE_META.map(({ id, label }, index) =>
      {
        const palette = PALETTES[id]
        const isActive = id === paletteId
        const previewColors = palette.colors.slice(0, 6)

        return (
          <button
            key={id}
            ref={(node) =>
            {
              optionRefs.current[id] = node
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setPaletteId(id)}
            onKeyDown={(event) =>
            {
              const key = event.key as SelectionNavigationKey

              if (
                ![
                  'ArrowLeft',
                  'ArrowRight',
                  'ArrowUp',
                  'ArrowDown',
                  'Home',
                  'End',
                ].includes(key)
              )
              {
                return
              }

              const nextIndex = resolveNextSelectionIndex({
                currentIndex: index,
                itemCount: PALETTE_META.length,
                key,
                columns: 4,
              })

              if (nextIndex === null)
              {
                return
              }

              event.preventDefault()

              const nextPaletteId = PALETTE_META[nextIndex].id
              setPaletteId(nextPaletteId)
              optionRefs.current[nextPaletteId]?.focus()
            }}
            className={`focus-custom flex flex-col items-center gap-1.5 rounded-lg p-2 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
              isActive
                ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                : 'hover:bg-[rgb(var(--t-overlay)/0.06)]'
            }`}
          >
            {/* color swatch preview strip */}
            <div className="flex w-full overflow-hidden rounded">
              {previewColors.map((color, i) => (
                <span
                  key={i}
                  className="h-5 flex-1"
                  style={{ background: color }}
                />
              ))}
            </div>
            <span className="text-[10px] text-[var(--t-text-faint)]">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
