// src/features/workspace/settings/ui/AspectRatioPicker.tsx
// presentational ratio chips & custom W:H input, shared by the modal & section

import {
  RATIO_OPTIONS,
  type RatioOption,
} from '~/features/workspace/boards/lib/aspectRatio'

const CHIP_BASE =
  'focus-custom rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
const CHIP_ACTIVE =
  'border-[var(--t-border-hover)] bg-[var(--t-bg-active)] text-[var(--t-text)]'
const CHIP_INACTIVE =
  'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)]'

// input chrome sized to match the chip row (text-xs px-2 py-1) so the custom
// W:H Apply controls visually extend the chip row rather than tower over it
const CUSTOM_INPUT_CLASS =
  'focus-custom w-12 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2 py-1 text-center text-xs text-[var(--t-text)] outline-none transition placeholder:text-[var(--t-text-faint)] focus:border-[var(--t-border-hover)]'

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
      className={`flex items-center gap-1.5 ${className ?? ''}`.trimEnd()}
    >
      <input
        aria-label="Custom width"
        value={width}
        onChange={(e) => onWidthChange(e.target.value)}
        placeholder="W"
        inputMode="decimal"
        className={CUSTOM_INPUT_CLASS}
      />
      <span className="text-xs text-[var(--t-text-faint)]">:</span>
      <input
        aria-label="Custom height"
        value={height}
        onChange={(e) => onHeightChange(e.target.value)}
        placeholder="H"
        inputMode="decimal"
        className={CUSTOM_INPUT_CLASS}
      />
      <button
        type="submit"
        disabled={!canApply}
        className={`${CHIP_BASE} ${canApply ? CHIP_ACTIVE : CHIP_INACTIVE} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        Apply
      </button>
    </form>
  )
}
