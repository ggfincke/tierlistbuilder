// src/features/workspace/imageEditor/ui/ZoomSlider.tsx
// live zoom slider plus percent stepper for image-editor transform controls

import { ZOOM_SLIDER_STEP } from '~/features/workspace/imageEditor/lib/imageEditorGeometry'
import {
  ceilToStep,
  clamp,
  floorToStep,
  parsePercentInput,
  roundToStep,
} from '~/shared/lib/math'
import { NumberStepper } from './NumberStepper'

interface ZoomSliderProps
{
  value: number
  min: number
  sliderMax: number
  onLiveChange: (value: number) => void
}

export const ZoomSlider = ({
  value,
  min,
  sliderMax,
  onLiveChange,
}: ZoomSliderProps) =>
{
  const percentValue = Math.round(clamp(value, min, sliderMax) * 100)
  const percentMin = Math.ceil(min * 100)
  const percentMax = Math.floor(sliderMax * 100)
  const sliderMin = ceilToStep(min, ZOOM_SLIDER_STEP)
  const sliderMaxValue = Math.max(
    sliderMin,
    floorToStep(sliderMax, ZOOM_SLIDER_STEP)
  )
  const sliderValue = clamp(
    roundToStep(value, ZOOM_SLIDER_STEP),
    sliderMin,
    sliderMaxValue
  )

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--t-text-muted)]">
      <span>Zoom</span>
      <input
        type="range"
        min={sliderMin}
        max={sliderMaxValue}
        step={ZOOM_SLIDER_STEP}
        value={sliderValue}
        onChange={(e) =>
          onLiveChange(
            clamp(
              roundToStep(Number(e.target.value), ZOOM_SLIDER_STEP),
              sliderMin,
              sliderMaxValue
            )
          )
        }
        className="w-56 accent-[var(--t-accent)] max-sm:w-36"
        aria-label="Zoom"
      />
      <NumberStepper
        value={percentValue}
        min={percentMin}
        max={percentMax}
        step={1}
        suffix="%"
        inputLabel="Zoom percent"
        decreaseLabel="Zoom out by 1 percent"
        increaseLabel="Zoom in by 1 percent"
        decreaseTitle="Decrease zoom by 1%"
        increaseTitle="Increase zoom by 1%"
        parseValue={parsePercentInput}
        onChange={(nextPercent) => onLiveChange(nextPercent / 100)}
      />
    </div>
  )
}
