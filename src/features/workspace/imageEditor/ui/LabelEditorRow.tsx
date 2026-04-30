// src/features/workspace/imageEditor/ui/LabelEditorRow.tsx
// caption visibility, placement, styling, & apply-to-all controls

import { useId } from 'react'
import { Check, ChevronRight, Wand2 } from 'lucide-react'

import {
  TEXT_STYLE_IDS,
  type TextStyleId,
} from '@tierlistbuilder/contracts/lib/theme'
import type {
  ItemLabelOptions,
  LabelOverlayPlacement,
  LabelPlacement,
  LabelPlacementMode,
  LabelScrim,
  LabelTextColor,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  LABEL_FONT_SIZE_PX_MAX,
  LABEL_FONT_SIZE_PX_MIN,
  LABEL_PLACEMENT_DEFAULT,
  LABEL_PLACEMENT_OVERLAY_PRESETS,
  LABEL_TEXT_COLORS,
} from '@tierlistbuilder/contracts/workspace/board'
import { LABEL_FONT_LABELS } from '../lib/labelEditorOptions'
import { NumberStepper } from './NumberStepper'

const INHERIT_TEXT_STYLE_VALUE = '__inherit'

const LABEL_TEXT_COLOR_NAMES: Record<LabelTextColor, string> = {
  auto: 'Auto',
  white: 'White',
  black: 'Black',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
}

const PLACEMENT_MODE_LABELS: Record<LabelPlacementMode, string> = {
  overlay: 'Overlay',
  captionAbove: 'Caption above',
  captionBelow: 'Caption below',
}

const PLACEMENT_MODE_ORDER: readonly LabelPlacementMode[] = [
  'overlay',
  'captionAbove',
  'captionBelow',
]

const PLACEMENT_PRESET_ORDER: readonly (keyof typeof LABEL_PLACEMENT_OVERLAY_PRESETS)[] =
  ['top', 'middle', 'bottom']

const PLACEMENT_PRESET_LABELS: Record<
  keyof typeof LABEL_PLACEMENT_OVERLAY_PRESETS,
  string
> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
}

const isOverlayPresetMatch = (
  placement: LabelPlacement,
  preset: LabelOverlayPlacement
): boolean =>
  placement.mode === 'overlay' &&
  Math.abs(placement.x - preset.x) < 0.001 &&
  Math.abs(placement.y - preset.y) < 0.001

interface LabelEditorRowProps
{
  resolvedPlacement: LabelPlacement
  resolvedScrim: LabelScrim
  resolvedTextColor: LabelTextColor
  resolvedFontSizePx: number
  resolvedTextStyleId: TextStyleId | undefined
  inheritedTextStyleLabel: string
  boardDefaultVisible: boolean
  itemOptions: ItemLabelOptions | undefined
  onPlacementChange: (placement: LabelPlacement) => void
  onScrimChange: (s: LabelScrim) => void
  onTextColorChange: (c: LabelTextColor) => void
  onFontSizePxChange: (px: number | undefined) => void
  onTextStyleChange: (t: TextStyleId | undefined) => void
  onVisibleChange: (visible: boolean) => void
  onClearOverrides: () => void
  onApplyToAll: () => void
  canApplyToAll: boolean
  appliedToAll: boolean
  applyToAllTitle: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export const LabelEditorRow = ({
  resolvedPlacement,
  resolvedScrim,
  resolvedTextColor,
  resolvedFontSizePx,
  resolvedTextStyleId,
  inheritedTextStyleLabel,
  boardDefaultVisible,
  itemOptions,
  onPlacementChange,
  onScrimChange,
  onTextColorChange,
  onFontSizePxChange,
  onTextStyleChange,
  onVisibleChange,
  onClearOverrides,
  onApplyToAll,
  canApplyToAll,
  appliedToAll,
  applyToAllTitle,
  expanded,
  onExpandedChange,
}: LabelEditorRowProps) =>
{
  const sizeId = useId()
  const fontId = useId()
  const sectionId = useId()
  const isOverlay = resolvedPlacement.mode === 'overlay'
  const hasOverrides = itemOptions !== undefined
  const applyDisabled = !canApplyToAll || appliedToAll
  const appliedTitle = appliedToAll
    ? 'Every item already matches the board defaults - nothing left to apply'
    : applyToAllTitle

  const handleModeSelect = (mode: LabelPlacementMode) =>
  {
    if (mode === resolvedPlacement.mode) return
    if (mode === 'overlay')
    {
      onPlacementChange(
        resolvedPlacement.mode === 'overlay'
          ? resolvedPlacement
          : LABEL_PLACEMENT_DEFAULT
      )
      return
    }
    onPlacementChange({ mode })
  }

  return (
    <div
      className="flex flex-col gap-2 border-t border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-2 text-xs"
      role="group"
      aria-label="Caption"
    >
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        aria-controls={sectionId}
        className="focus-custom inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        title={
          expanded ? 'Collapse caption controls' : 'Expand caption controls'
        }
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        Caption
      </button>
      {expanded && (
        <div id={sectionId} className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] p-0.5"
            role="group"
            aria-label="Caption visibility for this item"
            title={
              itemOptions?.visible === undefined
                ? `No override - falls back to the board default (currently ${
                    boardDefaultVisible ? 'shown' : 'hidden'
                  }). Pick Show or Hide here to override.`
                : `Per-item override active - this item is ${
                    itemOptions.visible ? 'always shown' : 'always hidden'
                  } regardless of the board default`
            }
          >
            <SegmentedChip
              active={itemOptions?.visible === true}
              onClick={() => onVisibleChange(true)}
              label="Show"
            />
            <SegmentedChip
              active={itemOptions?.visible === false}
              onClick={() => onVisibleChange(false)}
              label="Hide"
            />
          </div>
          <div
            className="flex items-center gap-1 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] p-0.5"
            role="group"
            aria-label="Placement"
          >
            {PLACEMENT_MODE_ORDER.map((mode) => (
              <SegmentedChip
                key={mode}
                active={resolvedPlacement.mode === mode}
                onClick={() => handleModeSelect(mode)}
                label={PLACEMENT_MODE_LABELS[mode]}
              />
            ))}
          </div>
          <div
            className={`flex items-center gap-1 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] p-0.5 transition-opacity ${
              isOverlay ? '' : 'pointer-events-none opacity-40'
            }`}
            role="group"
            aria-label="Caption position"
            title={
              isOverlay
                ? 'Anchor the overlay caption to the top, middle, or bottom of the image'
                : 'Caption position only applies in Overlay mode - switch placement to Overlay to use these'
            }
            aria-disabled={!isOverlay}
          >
            {PLACEMENT_PRESET_ORDER.map((presetKey) =>
            {
              const preset = LABEL_PLACEMENT_OVERLAY_PRESETS[presetKey]
              return (
                <SegmentedChip
                  key={presetKey}
                  active={
                    isOverlay && isOverlayPresetMatch(resolvedPlacement, preset)
                  }
                  onClick={() => onPlacementChange(preset)}
                  label={PLACEMENT_PRESET_LABELS[presetKey]}
                  disabled={!isOverlay}
                />
              )
            })}
          </div>
          <div
            className={`flex items-center gap-2 transition-opacity ${
              isOverlay ? '' : 'pointer-events-none opacity-40'
            }`}
            aria-disabled={!isOverlay}
          >
            <label
              className="text-[var(--t-text-muted)]"
              title={
                isOverlay
                  ? 'Caption backdrop - sits behind the text for legibility'
                  : 'Backdrop only applies in Overlay mode'
              }
            >
              Backdrop
            </label>
            <select
              value={resolvedScrim}
              onChange={(e) => onScrimChange(e.target.value as LabelScrim)}
              disabled={!isOverlay}
              className="focus-custom rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1 py-1 text-[var(--t-text)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed"
              aria-label="Caption backdrop"
              title={
                isOverlay
                  ? 'Caption backdrop - sits behind the text for legibility'
                  : 'Backdrop only applies in Overlay mode'
              }
              tabIndex={isOverlay ? undefined : -1}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="none">None</option>
            </select>
          </div>
          <div
            className={`flex items-center gap-2 transition-opacity ${
              isOverlay ? '' : 'pointer-events-none opacity-40'
            }`}
            aria-disabled={!isOverlay}
          >
            <label
              className="text-[var(--t-text-muted)]"
              title={
                isOverlay
                  ? 'Overlay text color - auto picks white or black based on the backdrop'
                  : 'Color only applies in Overlay mode'
              }
            >
              Color
            </label>
            <select
              value={resolvedTextColor}
              onChange={(e) =>
                onTextColorChange(e.target.value as LabelTextColor)
              }
              disabled={!isOverlay}
              className="focus-custom rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1 py-1 text-[var(--t-text)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed"
              aria-label="Overlay text color"
              tabIndex={isOverlay ? undefined : -1}
            >
              {LABEL_TEXT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {LABEL_TEXT_COLOR_NAMES[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={fontId} className="text-[var(--t-text-muted)]">
              Font
            </label>
            <select
              id={fontId}
              value={resolvedTextStyleId ?? INHERIT_TEXT_STYLE_VALUE}
              onChange={(e) =>
              {
                const v = e.target.value
                onTextStyleChange(
                  v === INHERIT_TEXT_STYLE_VALUE
                    ? undefined
                    : (v as TextStyleId)
                )
              }}
              className="focus-custom rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1 py-1 text-[var(--t-text)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              title={`Use the board font (currently ${inheritedTextStyleLabel}) or override per item`}
            >
              <option value={INHERIT_TEXT_STYLE_VALUE}>
                Use board font ({inheritedTextStyleLabel})
              </option>
              {TEXT_STYLE_IDS.map((id) => (
                <option key={id} value={id}>
                  {LABEL_FONT_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
          <FontSizeInput
            id={sizeId}
            value={resolvedFontSizePx}
            onChange={onFontSizePxChange}
            active={itemOptions?.fontSizePx !== undefined}
          />
          <button
            type="button"
            onClick={onClearOverrides}
            disabled={!hasOverrides}
            className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            title="Clear this item's caption overrides"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onApplyToAll}
            disabled={applyDisabled}
            aria-label={
              appliedToAll
                ? 'Caption settings already applied to all items'
                : 'Apply caption settings to all items'
            }
            className={`focus-custom ml-auto inline-flex items-center gap-1 rounded px-2 py-1 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
              appliedToAll
                ? 'bg-[var(--t-bg-active)] text-[var(--t-text-muted)] disabled:opacity-100'
                : 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:opacity-40'
            }`}
            title={appliedTitle}
          >
            {appliedToAll ? (
              <Check className="h-3 w-3" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            {appliedToAll ? 'Applied to all items' : 'Apply to all items'}
          </button>
        </div>
      )}
    </div>
  )
}

interface FontSizeInputProps
{
  id: string
  value: number
  onChange: (px: number | undefined) => void
  active: boolean
}

const FONT_SIZE_STEP_PX = 1

const FontSizeInput = ({ id, value, onChange, active }: FontSizeInputProps) =>
{
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-[var(--t-text-muted)]"
        title={`Caption font size (${LABEL_FONT_SIZE_PX_MIN}-${LABEL_FONT_SIZE_PX_MAX}px)`}
      >
        Size
      </label>
      <NumberStepper
        id={id}
        value={value}
        min={LABEL_FONT_SIZE_PX_MIN}
        max={LABEL_FONT_SIZE_PX_MAX}
        step={FONT_SIZE_STEP_PX}
        suffix="px"
        inputLabel="Caption font size in pixels"
        decreaseLabel="Decrease font size"
        increaseLabel="Increase font size"
        decreaseTitle="Smaller"
        increaseTitle="Larger"
        active={active}
        onChange={onChange}
      />
    </div>
  )
}

interface SegmentedChipProps
{
  active: boolean
  onClick: () => void
  label: string
  disabled?: boolean
}

const SegmentedChip = ({
  active,
  onClick,
  label,
  disabled,
}: SegmentedChipProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={`focus-custom rounded px-2 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed ${
      active
        ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'
        : 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)]'
    }`}
  >
    {label}
  </button>
)
