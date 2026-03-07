// src/components/board/ColorPicker.tsx
// preset color swatch grid for selecting a tier label color
import { PRESET_TIER_COLORS } from '../../utils/constants'

interface ColorPickerProps {
  // currently selected hex color
  value: string
  // called w/ the new hex color when a swatch is clicked
  onChange: (color: string) => void
}

export const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {PRESET_TIER_COLORS.map((color) => {
        // highlight the swatch that matches the current tier color
        const isSelected = color.toLowerCase() === value.toLowerCase()

        return (
          <button
            key={color}
            type="button"
            className={`h-6 w-6 rounded-full transition hover:scale-110 ${
              isSelected ? 'ring-2 ring-[#222] ring-offset-1' : ''
            }`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Set tier color to ${color}`}
          />
        )
      })}
    </div>
  )
}
