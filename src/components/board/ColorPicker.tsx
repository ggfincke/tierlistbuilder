// src/components/board/ColorPicker.tsx
// preset color swatch grid for selecting a tier label color

import { memo } from 'react'
import type { TierColorSource } from '../../types'

interface ColorPickerProps
{
  // currently selected hex color
  value: string
  // ordered preset colors to show as swatches
  presets: string[]
  // called w/ the new hex color when a swatch is clicked
  onChange: (color: string, colorSource: TierColorSource) => void
}

export const ColorPicker = memo(
  ({ value, presets, onChange }: ColorPickerProps) =>
  {
    return (
      <div className="flex flex-wrap gap-2 p-2">
        {presets.map((color, index) =>
        {
          // highlight the swatch that matches the current tier color
          const isSelected = color.toLowerCase() === value.toLowerCase()

          return (
            <button
              key={color}
              type="button"
              className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                isSelected
                  ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                  : ''
              }`}
              style={{ backgroundColor: color }}
              onClick={() =>
                onChange(color, {
                  paletteType: 'preset',
                  index,
                })
              }
              aria-label={`Set tier color to ${color}`}
            />
          )
        })}
      </div>
    )
  }
)
