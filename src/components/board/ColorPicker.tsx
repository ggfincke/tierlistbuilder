// src/components/board/ColorPicker.tsx
// preset swatch tray + separate custom color popup for tier label colors

import { memo, useMemo, useState, type RefObject } from 'react'
import Wheel from '@uiw/react-color-wheel'
import ShadeSlider from '@uiw/react-color-shade-slider'
import {
  hexToHsva,
  hsvaToHex,
  hsvaToRgba,
  type HsvaColor,
} from '@uiw/color-convert'
import { Pipette } from 'lucide-react'

import { createPaletteTierColorSpec } from '../../domain/tierColors'
import type { TierColorSpec } from '../../types'
import {
  formatRgbInputs,
  hexToRgbColor,
  normalizeHexColor,
  parseRgbInputState,
  rgbToHexColor,
  type RgbInputState,
} from '../../utils/color'
import { getColorName } from '../../utils/colorName'
import { TextInput } from '../ui/TextInput'

interface ColorPickerProps
{
  // canonical color spec for the current tier
  colorSpec: TierColorSpec
  // ordered palette colors to show as swatches
  colors: string[]
  // ref attached to the custom pipette trigger button
  customTriggerRef: RefObject<HTMLButtonElement | null>
  // whether the separate custom popup is visible
  showCustomPicker: boolean
  // called when a preset swatch is picked
  onChange: (colorSpec: TierColorSpec) => void
  // called when the custom pipette button is clicked
  onToggleCustomPicker: () => void
}

interface CustomColorPickerProps
{
  // currently saved tier color
  value: string
  // called when the current draft should be committed
  onApply: (color: string) => void
  // called when the popup should close without saving
  onCancel: () => void
  // called on every draft color change for live preview
  onPreview?: (color: string) => void
}

interface ColorDraftState
{
  // current hsva value shown by the wheel + slider
  hsva: HsvaColor
  // raw hex input text
  hexInput: string
  // raw rgb input text
  rgbInputs: RgbInputState
  // whether the current inputs can be applied
  isValid: boolean
}

const FALLBACK_COLOR = '#888888'

// build a valid draft state from a stored color
const createDraftState = (color: string): ColorDraftState =>
{
  const normalized = normalizeHexColor(color) ?? FALLBACK_COLOR
  const hsva = hexToHsva(normalized)
  const rgba = hsvaToRgba(hsva)

  return {
    hsva,
    hexInput: normalized,
    rgbInputs: formatRgbInputs({
      red: rgba.r,
      green: rgba.g,
      blue: rgba.b,
    }),
    isValid: true,
  }
}

// convert hsva to the canonical stored hex format
const getDraftHex = (hsva: HsvaColor): string =>
  hsvaToHex({ ...hsva, a: 1 }).toLowerCase()

export const ColorPicker = memo(
  ({
    colorSpec,
    colors,
    customTriggerRef,
    showCustomPicker,
    onChange,
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

export const CustomColorPicker = memo(
  ({ value, onApply, onCancel, onPreview }: CustomColorPickerProps) =>
  {
    const [draftState, setDraftState] = useState<ColorDraftState>(() =>
      createDraftState(value)
    )
    const previewHex = useMemo(
      () => getDraftHex(draftState.hsva),
      [draftState.hsva]
    )

    // sync every draft field from a valid hsva value
    const updateDraftFromHsva = (hsva: HsvaColor) =>
    {
      const nextHex = getDraftHex(hsva)
      const rgb = hexToRgbColor(nextHex)

      setDraftState({
        hsva,
        hexInput: nextHex,
        rgbInputs: rgb
          ? formatRgbInputs(rgb)
          : {
              red: '0',
              green: '0',
              blue: '0',
            },
        isValid: true,
      })

      onPreview?.(nextHex)
    }

    // update the draft from the hex field when it reaches a valid value
    const updateHexInput = (nextValue: string) =>
    {
      const normalizedInput = nextValue.replace(/\s+/g, '').toLowerCase()
      const normalizedColor = normalizeHexColor(normalizedInput)

      if (!normalizedColor)
      {
        setDraftState((current) => ({
          ...current,
          hexInput: normalizedInput,
          isValid: false,
        }))
        return
      }

      updateDraftFromHsva(hexToHsva(normalizedColor))
    }

    // update the draft from the rgb fields when all three channels are valid
    const updateRgbInput = (
      channel: keyof RgbInputState,
      nextValue: string
    ) =>
    {
      const sanitizedValue = nextValue.replace(/[^\d]/g, '')

      setDraftState((current) =>
      {
        const nextRgbInputs = {
          ...current.rgbInputs,
          [channel]: sanitizedValue,
        }
        const parsed = parseRgbInputState(nextRgbInputs)

        if (!parsed)
        {
          return {
            ...current,
            rgbInputs: nextRgbInputs,
            isValid: false,
          }
        }

        const nextHex = rgbToHexColor(parsed)
        const hsva = hexToHsva(nextHex)

        return {
          hsva,
          hexInput: nextHex,
          rgbInputs: formatRgbInputs(parsed),
          isValid: true,
        }
      })
    }

    // commit the current custom draft as a single store update
    const applyCustomColor = () =>
    {
      if (!draftState.isValid)
      {
        return
      }

      onApply(previewHex)
    }

    return (
      <form
        className="space-y-2 p-2.5"
        onSubmit={(event) =>
        {
          event.preventDefault()
          applyCustomColor()
        }}
      >
        <div className="flex items-center gap-3 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-2.5">
          <div
            className="h-10 w-10 shrink-0 rounded-lg border border-[var(--t-border-secondary)]"
            style={{ backgroundColor: previewHex }}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--t-text)]">Custom</p>
            <p className="truncate text-xs text-[var(--t-text-muted)]">
              {draftState.isValid ? previewHex : 'Enter a valid hex or rgb'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-2.5">
          <Wheel
            className="mx-auto"
            color={draftState.hsva}
            width={160}
            height={160}
            onChange={(color) => updateDraftFromHsva(color.hsva)}
          />

          <ShadeSlider
            className="mt-4"
            hsva={draftState.hsva}
            onChange={(shade) =>
              updateDraftFromHsva({
                ...draftState.hsva,
                ...shade,
                a: 1,
              })
            }
          />
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--t-text-faint)]">
              Hex
            </span>
            <TextInput
              value={draftState.hexInput}
              onChange={(event) => updateHexInput(event.target.value)}
              className="w-full rounded-lg border-[var(--t-border)] focus:border-[var(--t-accent-hover)]"
              placeholder="#aabbcc"
              aria-label="Custom hex color"
              spellCheck={false}
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['red', 'R'],
                ['green', 'G'],
                ['blue', 'B'],
              ] as const
            ).map(([channel, label]) => (
              <label key={channel} className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--t-text-faint)]">
                  {label}
                </span>
                <TextInput
                  value={draftState.rgbInputs[channel]}
                  onChange={(event) =>
                    updateRgbInput(channel, event.target.value)
                  }
                  className="w-full rounded-lg border-[var(--t-border)] px-2 text-center focus:border-[var(--t-accent-hover)]"
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={`${label} value`}
                  spellCheck={false}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-[var(--t-text-faint)]">
            Apply stores this as a custom color that won&apos;t sync when the
            theme changes.
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--t-border)] px-3 py-1.5 text-sm text-[var(--t-text)] transition hover:border-[var(--t-border-secondary)] hover:bg-[rgb(var(--t-overlay)/0.06)]"
              onClick={onCancel}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-lg bg-[var(--t-accent)] px-3 py-1.5 text-sm font-medium text-[var(--t-accent-foreground)] transition hover:bg-[var(--t-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--t-border)] disabled:text-[var(--t-text-faint)]"
              disabled={!draftState.isValid}
            >
              Apply
            </button>
          </div>
        </div>
      </form>
    )
  }
)
