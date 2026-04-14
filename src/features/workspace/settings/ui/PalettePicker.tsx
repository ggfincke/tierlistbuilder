// src/features/workspace/settings/ui/PalettePicker.tsx
// grid of clickable palette preview cards for the Appearance section

import { useRovingSelection } from '@/shared/selection/useRovingSelection'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { PALETTE_META, PALETTES } from '@/shared/theme'
import type { PaletteId } from '@/shared/types/theme'

const PALETTE_IDS = PALETTE_META.map((m) => m.id) as PaletteId[]

interface PalettePickerProps
{
  ariaLabelledby?: string
}

export const PalettePicker = ({ ariaLabelledby }: PalettePickerProps) =>
{
  const paletteId = useSettingsStore((s) => s.paletteId)
  const setPaletteId = useSettingsStore((s) => s.setPaletteId)
  const { getItemProps, groupProps, isActive } = useRovingSelection({
    items: PALETTE_IDS,
    activeKey: paletteId,
    onSelect: setPaletteId,
    kind: 'radio',
    groupLabelledby: ariaLabelledby,
    groupLabel: ariaLabelledby ? undefined : 'Tier color palette',
    columns: 4,
  })

  return (
    <div {...groupProps} className="grid grid-cols-4 gap-2">
      {PALETTE_META.map(({ id, label }, index) =>
      {
        const palette = PALETTES[id]
        const itemIsActive = isActive(id)
        const previewColors = palette.colors.slice(0, 6)

        return (
          <button
            key={id}
            {...getItemProps(id, index)}
            className={`focus-custom flex flex-col items-center gap-1.5 rounded-lg p-2 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
              itemIsActive
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
