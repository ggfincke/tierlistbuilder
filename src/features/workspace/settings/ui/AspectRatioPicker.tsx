// src/features/workspace/settings/ui/AspectRatioPicker.tsx
// presentational ratio chips & custom W:H input, shared by the modal & section

import {
  RATIO_OPTIONS,
  type RatioOption,
} from '@/features/workspace/boards/lib/aspectRatio'
import { SecondaryButton } from '@/shared/ui/SecondaryButton'
import { TextInput } from '@/shared/ui/TextInput'

const CHIP_BASE =
  'focus-custom rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
const CHIP_ACTIVE =
  'border-[var(--t-border-hover)] bg-[var(--t-bg-active)] text-[var(--t-text)]'
const CHIP_INACTIVE =
  'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)]'

interface AspectRatioChipsProps
{
  selectedOption: RatioOption
  onSelect: (option: RatioOption) => void
  // optional alignment override — modal wants left-align, section wants right
  alignClassName?: string
}

export const AspectRatioChips = ({
  selectedOption,
  onSelect,
  alignClassName,
}: AspectRatioChipsProps) => (
  <div className={`flex flex-wrap gap-1.5 ${alignClassName ?? ''}`.trimEnd()}>
    {RATIO_OPTIONS.map((option) =>
    {
      const isActive = option === selectedOption
      return (
        <button
          key={option.label}
          type="button"
          onClick={() => onSelect(option)}
          className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        >
          {option.label}
        </button>
      )
    })}
  </div>
)

interface CustomRatioInputProps
{
  width: string
  height: string
  onWidthChange: (value: string) => void
  onHeightChange: (value: string) => void
  onApply: () => void
  canApply: boolean
  className?: string
}

export const CustomRatioInput = ({
  width,
  height,
  onWidthChange,
  onHeightChange,
  onApply,
  canApply,
  className,
}: CustomRatioInputProps) =>
{
  const handleSubmit = (event: React.FormEvent) =>
  {
    event.preventDefault()
    onApply()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-2 ${className ?? ''}`.trimEnd()}
    >
      <TextInput
        aria-label="Custom width"
        value={width}
        onChange={(e) => onWidthChange(e.target.value)}
        placeholder="W"
        className="w-16 text-center"
        inputMode="decimal"
      />
      <span className="text-sm text-[var(--t-text-faint)]">:</span>
      <TextInput
        aria-label="Custom height"
        value={height}
        onChange={(e) => onHeightChange(e.target.value)}
        placeholder="H"
        className="w-16 text-center"
        inputMode="decimal"
      />
      <SecondaryButton
        type="submit"
        disabled={!canApply}
        variant="surface"
        className="font-medium"
      >
        Apply
      </SecondaryButton>
    </form>
  )
}
