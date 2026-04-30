// src/features/workspace/boards/ui/CustomColorPicker.tsx
// custom hsva color popup for tier label colors

import { memo, useMemo, useState } from 'react'
import Wheel from '@uiw/react-color-wheel'
import ShadeSlider from '@uiw/react-color-shade-slider'
import {
  hexToHsva,
  hsvaToHex,
  hsvaToRgba,
  type HsvaColor,
} from '@uiw/color-convert'

import { FALLBACK_COLOR } from '~/shared/theme/tierColors'
import {
  formatRgbInputs,
  hexToRgbColor,
  normalizeHexColor,
  parseRgbInputState,
  rgbToHexColor,
  type RgbInputState,
} from '~/shared/lib/color'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

interface CustomColorPickerProps
{
  value: string
  onApply: (color: string) => void
  onCancel: () => void
  onPreview?: (color: string) => void
}

interface ColorDraftState
{
  hsva: HsvaColor
  hexInput: string
  rgbInputs: RgbInputState
  isValid: boolean
}

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
            <SecondaryButton variant="outline" onClick={onCancel}>
              Cancel
            </SecondaryButton>

            <PrimaryButton type="submit" disabled={!draftState.isValid}>
              Apply
            </PrimaryButton>
          </div>
        </div>
      </form>
    )
  }
)
