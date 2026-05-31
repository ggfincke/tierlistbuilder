// src/features/workspace/imageEditor/ui/PaddingSlider.tsx
// live plate-inset slider plus percent stepper for image-editor controls. the
// value is a fraction of the cell edge; the UI works in whole percent

import {
  IMAGE_PADDING_MAX,
  IMAGE_PADDING_MIN,
} from '@tierlistbuilder/contracts/workspace/board'
import { clamp, parsePercentInput } from '~/shared/lib/math'
import { NumberStepper } from '~/shared/ui/NumberStepper'

interface PaddingSliderProps
{
  // current padding as a fraction (0..IMAGE_PADDING_MAX)
  value: number
  onLiveChange: (value: number) => void
}

const PERCENT_MIN = Math.round(IMAGE_PADDING_MIN * 100)
const PERCENT_MAX = Math.round(IMAGE_PADDING_MAX * 100)

const toFraction = (percent: number): number =>
  clamp(percent / 100, IMAGE_PADDING_MIN, IMAGE_PADDING_MAX)

export const PaddingSlider = ({ value, onLiveChange }: PaddingSliderProps) =>
{
  const percentValue = Math.round(
    clamp(value, IMAGE_PADDING_MIN, IMAGE_PADDING_MAX) * 100
  )

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--t-text-muted)]">
      <span>Padding</span>
      <input
        type="range"
        min={PERCENT_MIN}
        max={PERCENT_MAX}
        step={1}
        value={percentValue}
        onChange={(e) => onLiveChange(toFraction(Number(e.target.value)))}
        className="w-40 accent-[var(--t-accent)] max-sm:w-28"
        aria-label="Padding"
      />
      <NumberStepper
        value={percentValue}
        min={PERCENT_MIN}
        max={PERCENT_MAX}
        step={1}
        suffix="%"
        inputLabel="Padding percent"
        decreaseLabel="Decrease padding by 1 percent"
        increaseLabel="Increase padding by 1 percent"
        decreaseTitle="Decrease padding by 1%"
        increaseTitle="Increase padding by 1%"
        parseValue={parsePercentInput}
        onChange={(nextPercent) => onLiveChange(toFraction(nextPercent))}
      />
    </div>
  )
}
