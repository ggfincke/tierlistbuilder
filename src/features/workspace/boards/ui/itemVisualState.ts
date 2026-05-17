// src/features/workspace/boards/ui/itemVisualState.ts
// resolves the visual class & opacity for a TierItem — selected items get
// a soft mint bg tint; keyboard nav/drag use rings for distinct ergonomics

interface ItemVisualInput
{
  isSelected: boolean
  isKeyboardFocused: boolean
  isKeyboardDragging: boolean
  isDragging: boolean
}

interface ItemVisualOutput
{
  // sibling-layer class for the outer tile (z-index only). painted bg/ring
  // moved to overlayClass so the artwork doesn't occlude the selection cue
  outerClass: string
  // absolute-inset overlay sitting above the image: tint + ring paint here
  overlayClass: string
  opacity: number
}

// selected + keyboard focused — stronger mint backdrop plus an inset accent-2
// ring marks the actively focused item within a multi-select. ring-inset keeps
// the cue contained, avoiding the sibling bleed an outer ring would cause
const SELECTED_FOCUSED_OVERLAY =
  'bg-[color-mix(in_srgb,var(--t-accent)_22%,transparent)] ring-2 ring-inset ring-[var(--t-accent-2)] transition-colors duration-150'

// selected only — soft mint backdrop behind the artwork. ~15% mix keeps the
// cue warm rather than loud, so dense selection clusters read as tinted
// cells instead of a row of bordered checkboxes
const SELECTED_OVERLAY =
  'bg-[color-mix(in_srgb,var(--t-accent)_15%,transparent)] transition-colors duration-150'

// keyboard drag in progress — ring indicates the item being moved. matches
// SELECTED_FOCUSED's inset ring style for visual consistency across all
// ring-based states; mint color distinguishes from focused-selected's lime
const KEYBOARD_DRAGGING_OVERLAY =
  'ring-2 ring-inset ring-[var(--t-accent)] transition-colors duration-150'

// keyboard focus only (no selection) — soft accent-2 tint marks the arrow
// cursor. uses the kicker color (lime/magenta/terracotta per theme) so it
// reads distinct from the mint selection tint w/o needing a ring overlay
const KEYBOARD_FOCUSED_OVERLAY =
  'bg-[color-mix(in_srgb,var(--t-accent-2)_18%,transparent)] transition-colors duration-150'

export const resolveItemVisualState = ({
  isSelected,
  isKeyboardFocused,
  isKeyboardDragging,
  isDragging,
}: ItemVisualInput): ItemVisualOutput =>
{
  // priority: selected+focused > selected > keyboard dragging > keyboard focused > none
  let outerClass = ''
  let overlayClass = ''
  if (isSelected && isKeyboardFocused)
  {
    outerClass = 'z-20'
    overlayClass = SELECTED_FOCUSED_OVERLAY
  }
  else if (isSelected)
  {
    outerClass = 'z-10'
    overlayClass = SELECTED_OVERLAY
  }
  else if (isKeyboardDragging)
  {
    outerClass = 'z-20'
    overlayClass = KEYBOARD_DRAGGING_OVERLAY
  }
  else if (isKeyboardFocused)
  {
    outerClass = 'z-10'
    overlayClass = KEYBOARD_FOCUSED_OVERLAY
  }

  // opacity — pointer drag fades the source tile; keyboard drag dims it
  let opacity = 1
  if (isDragging)
  {
    opacity = 0.4
  }
  else if (isKeyboardDragging)
  {
    opacity = 0.75
  }

  return { outerClass, overlayClass, opacity }
}
