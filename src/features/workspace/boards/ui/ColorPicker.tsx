// src/features/workspace/boards/ui/ColorPicker.tsx
// preset swatch tray for tier label colors

import { memo, useMemo, type RefObject } from 'react'
import { Pipette } from 'lucide-react'

import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import type { TierColorSpec } from '@tierlistbuilder/contracts/lib/theme'
import { getColorName } from '~/shared/lib/colorName'

interface ColorPickerProps
{
  colorSpec: TierColorSpec
  colors: string[]
  customTriggerRef: RefObject<HTMLButtonElement | null>
  showCustomPicker: boolean
  onChange: (colorSpec: TierColorSpec) => void
  onCustomPickerIntent?: () => void
  onToggleCustomPicker: () => void
}

export const ColorPicker = memo(
  ({
    colorSpec,
    colors,
    customTriggerRef,
    showCustomPicker,
    onChange,
    onCustomPickerIntent,
    onToggleCustomPicker,
  }: ColorPickerProps) =>
  {
    const selectedPresetIndex = useMemo(() =>
    {
      if (colorSpec.kind === 'custom')
      {
        return -1
      }

      return colorSpec.index
    }, [colorSpec])
    const isCustomSelected = colorSpec.kind === 'custom'

    return (
      <div className="flex flex-wrap gap-2 p-2">
        {colors.map((color, index) =>
        {
          const isSelected = index === selectedPresetIndex

          return (
            <button
              key={`${index}-${color}`}
              type="button"
              className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                isSelected
                  ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                  : ''
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onChange(createPaletteTierColorSpec(index))}
              aria-label={`Set tier color to ${getColorName(color)}`}
            />
          )
        })}

        <button
          ref={customTriggerRef}
          type="button"
          className={`flex h-6 w-6 items-center justify-center rounded-full border border-[var(--t-border-secondary)] bg-[var(--t-bg-overlay)] text-[var(--t-text)] transition hover:scale-110 ${
            isCustomSelected || showCustomPicker
              ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
              : ''
          }`}
          onFocus={onCustomPickerIntent}
          onPointerEnter={onCustomPickerIntent}
          onClick={onToggleCustomPicker}
          aria-label="Open custom color picker"
          aria-expanded={showCustomPicker}
        >
          <Pipette className="h-3 w-3" strokeWidth={1.8} />
        </button>
      </div>
    )
  }
)
