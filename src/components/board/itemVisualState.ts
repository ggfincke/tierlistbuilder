// src/components/board/itemVisualState.ts
// resolves the visual ring/outline class & opacity for a TierItem based
// on its selection, keyboard focus, & drag state

interface ItemVisualInput
{
  isSelected: boolean
  isKeyboardFocused: boolean
  isKeyboardDragging: boolean
  isDragging: boolean
}

interface ItemVisualOutput
{
  stateClass: string
  opacity: number
}

// selected + keyboard focused — ring w/ outer outline to distinguish
// the focused item within a multi-selection
const SELECTED_FOCUSED =
  'z-20 ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-surface)] transition-transform duration-100 outline-2 outline-offset-4 outline-[var(--t-accent-hover)]'

// selected only — ring marks group membership, no outline needed
const SELECTED =
  'z-20 ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-surface)] transition-transform duration-100'

// keyboard drag in progress — ring indicates the item being moved
const KEYBOARD_DRAGGING =
  'z-20 ring-2 ring-[var(--t-accent)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'

// keyboard focus only (no selection) — lighter ring for nav cursor
const KEYBOARD_FOCUSED =
  'z-10 ring-2 ring-[var(--t-accent-hover)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'

export const resolveItemVisualState = ({
  isSelected,
  isKeyboardFocused,
  isKeyboardDragging,
  isDragging,
}: ItemVisualInput): ItemVisualOutput =>
{
  // className — priority: selected+focused > selected > keyboard dragging > keyboard focused > none
  let stateClass = ''
  if (isSelected && isKeyboardFocused)
  {
    stateClass = SELECTED_FOCUSED
  }
  else if (isSelected)
  {
    stateClass = SELECTED
  }
  else if (isKeyboardDragging)
  {
    stateClass = KEYBOARD_DRAGGING
  }
  else if (isKeyboardFocused)
  {
    stateClass = KEYBOARD_FOCUSED
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

  return { stateClass, opacity }
}
