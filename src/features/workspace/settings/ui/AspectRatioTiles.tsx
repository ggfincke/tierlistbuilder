// src/features/workspace/settings/ui/AspectRatioTiles.tsx
// visual ratio tile grid w/ inline custom W:H for the mixed-ratio modal

import {
  CUSTOM_RATIO_OPTION,
  formatPreciseAspectRatio,
  NON_CUSTOM_RATIO_OPTIONS,
  type RatioOption,
} from '~/features/workspace/boards/lib/aspectRatio'
import { isPositiveFiniteNumber } from '~/shared/lib/typeGuards'

const RECT_BOX = 28

const GRID_STYLE = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(3rem, 1fr))',
}

// scale a ratio-correct rect inside a square bounding box, floored so extreme
// ratios still render a visible sliver instead of collapsing to zero
const fitRectInBox = (ratio: number, maxSize: number) =>
  ratio >= 1
    ? { width: maxSize, height: Math.max(2, maxSize / ratio) }
    : { width: Math.max(2, maxSize * ratio), height: maxSize }

const parseCustomRatio = (width: string, height: string): number =>
{
  const w = Number(width)
  const h = Number(height)
  return isPositiveFiniteNumber(w) && isPositiveFiniteNumber(h) ? w / h : 1
}

const TILE_SHELL =
  'focus-custom flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
const TILE_ACTIVE =
  'border-[var(--t-border-hover)] bg-[var(--t-bg-active)] text-[var(--t-text)]'
const TILE_INACTIVE =
  'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)]'

const INPUT_CLASS =
  'focus-custom w-10 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1.5 py-0.5 text-center text-xs text-[var(--t-text)] outline-none transition placeholder:text-[var(--t-text-faint)] focus:border-[var(--t-border-hover)]'

const APPLY_BASE =
  'focus-custom rounded border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60'
const APPLY_READY =
  'border-[var(--t-border-hover)] bg-[var(--t-bg-active)] text-[var(--t-text)]'
const APPLY_IDLE =
  'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-faint)]'

interface RatioTileProps
{
  option: RatioOption
  isActive: boolean
  onSelect: (option: RatioOption) => void
  // ratio preview for the Auto tile — derived from current items when available
  autoRatio?: number
}

// preset / auto tile — rectangle preview drawn at the option's ratio + label
const RatioTile = ({
  option,
  isActive,
  onSelect,
  autoRatio,
}: RatioTileProps) =>
{
  const isAuto = option.kind === 'auto'
  const ratio = isAuto ? (autoRatio ?? 1) : (option.value ?? 1)
  const rect = fitRectInBox(ratio, RECT_BOX)
  // primary label stays terse ("Auto" / "1:1"); the resolved auto ratio moves
  // to a muted subtitle line so users see what Auto resolves to w/o the
  // decimal noise dominating the chip
  const autoSubtitle =
    isAuto && autoRatio ? formatPreciseAspectRatio(autoRatio) : null
  const ariaLabel =
    isAuto && autoSubtitle ? `Auto (${autoSubtitle})` : option.label

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isActive}
      onClick={() => onSelect(option)}
      className={`${TILE_SHELL} w-full ${isActive ? TILE_ACTIVE : TILE_INACTIVE}`}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: RECT_BOX, height: RECT_BOX }}
      >
        <div
          className={`border ${isAuto ? 'border-dashed' : ''} ${
            isActive ? 'border-[var(--t-accent)]' : 'border-current'
          }`}
          style={{ width: rect.width, height: rect.height }}
        />
      </div>
      <span className="text-[0.7rem] font-medium leading-tight">
        {option.label}
      </span>
      {autoSubtitle && (
        <span
          aria-hidden="true"
          className="text-[0.6rem] leading-none text-[var(--t-text-faint)] tabular-nums"
        >
          {autoSubtitle}
        </span>
      )}
    </button>
  )
}

interface CustomTileProps
{
  isActive: boolean
  width: string
  height: string
  onWidthChange: (v: string) => void
  onHeightChange: (v: string) => void
  onApply: () => void
  canApply: boolean
}

// custom tile — live-preview rect reflecting typed W:H + inline editor & apply
const CustomTile = ({
  isActive,
  width,
  height,
  onWidthChange,
  onHeightChange,
  onApply,
  canApply,
}: CustomTileProps) =>
{
  const ratio = parseCustomRatio(width, height)
  const rect = fitRectInBox(ratio, RECT_BOX)

  const handleSubmit = (event: React.FormEvent) =>
  {
    event.preventDefault()
    onApply()
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 rounded-md border p-1.5 transition-colors ${
        isActive
          ? 'border-[var(--t-border-hover)] bg-[var(--t-bg-active)]'
          : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]'
      }`}
    >
      <div className="flex flex-col items-center gap-1">
        <div
          className="flex items-center justify-center"
          style={{ width: RECT_BOX, height: RECT_BOX }}
        >
          <div
            className={`border ${
              isActive
                ? 'border-[var(--t-accent)]'
                : 'border-[var(--t-text-faint)]'
            }`}
            style={{ width: rect.width, height: rect.height }}
          />
        </div>
        <span
          className={`text-[0.7rem] font-medium leading-tight ${
            isActive ? 'text-[var(--t-text)]' : 'text-[var(--t-text-faint)]'
          }`}
        >
          Custom
        </span>
      </div>
      <form
        className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1"
        onSubmit={handleSubmit}
      >
        <input
          aria-label="Custom width"
          value={width}
          onChange={(e) => onWidthChange(e.target.value)}
          placeholder="W"
          inputMode="decimal"
          className={INPUT_CLASS}
        />
        <span className="text-xs text-[var(--t-text-faint)]">:</span>
        <input
          aria-label="Custom height"
          value={height}
          onChange={(e) => onHeightChange(e.target.value)}
          placeholder="H"
          inputMode="decimal"
          className={INPUT_CLASS}
        />
        <button
          type="submit"
          disabled={!canApply}
          className={`${APPLY_BASE} ${canApply ? APPLY_READY : APPLY_IDLE}`}
        >
          Apply
        </button>
      </form>
    </div>
  )
}

interface AspectRatioTilesProps
{
  selectedOption: RatioOption
  onSelect: (option: RatioOption) => void
  customWidth: string
  customHeight: string
  onCustomWidthChange: (v: string) => void
  onCustomHeightChange: (v: string) => void
  onApplyCustom: () => void
  canApplyCustom: boolean
  autoRatio?: number
  // alert modal hides Custom to stay focused on the quick-fix path; settings
  // & editor keep it visible for the power-user case
  showCustom?: boolean
}

export const AspectRatioTiles = ({
  selectedOption,
  onSelect,
  customWidth,
  customHeight,
  onCustomWidthChange,
  onCustomHeightChange,
  onApplyCustom,
  canApplyCustom,
  autoRatio,
  showCustom = true,
}: AspectRatioTilesProps) => (
  <div className="flex flex-col gap-2">
    <div className="grid gap-2" style={GRID_STYLE}>
      {NON_CUSTOM_RATIO_OPTIONS.map((option) => (
        <RatioTile
          key={option.label}
          option={option}
          isActive={option === selectedOption}
          onSelect={onSelect}
          autoRatio={autoRatio}
        />
      ))}
    </div>
    {showCustom && (
      <CustomTile
        isActive={CUSTOM_RATIO_OPTION === selectedOption}
        width={customWidth}
        height={customHeight}
        onWidthChange={onCustomWidthChange}
        onHeightChange={onCustomHeightChange}
        onApply={onApplyCustom}
        canApply={canApplyCustom}
      />
    )}
  </div>
)
