// src/components/settings/PalettePicker.tsx
// grid of clickable palette preview cards for the Appearance section

import { useSettingsStore } from '../../store/useSettingsStore'
import { PALETTE_META, PALETTES } from '../../theme'

export const PalettePicker = () =>
{
  const paletteId = useSettingsStore((s) => s.paletteId)
  const setPaletteId = useSettingsStore((s) => s.setPaletteId)

  return (
    <div className="grid grid-cols-4 gap-2">
      {PALETTE_META.map(({ id, label }) =>
      {
        const palette = PALETTES[id]
        const isActive = id === paletteId
        const previewColors = palette.colors.slice(0, 6)

        return (
          <button
            key={id}
            type="button"
            onClick={() => setPaletteId(id)}
            className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition ${
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
