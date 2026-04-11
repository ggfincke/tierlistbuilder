// src/hooks/keyboardFocus.ts
// focus helpers for keyboard browse & drag mode

const focusBoardRegion = () =>
{
  if (typeof document === 'undefined')
  {
    return
  }

  const boardElement = document.querySelector<HTMLElement>(
    '[data-testid="tier-list-board"]'
  )
  boardElement?.focus({ preventScroll: true })
}

const focusItemById = (itemId: string) =>
{
  if (typeof document === 'undefined')
  {
    return
  }

  const itemElement = document.querySelector<HTMLElement>(
    `[data-testid="tier-item-${itemId}"]`
  )

  if (itemElement)
  {
    itemElement.focus({ preventScroll: true })
    return
  }

  focusBoardRegion()
}

// cancel the previous focus-restore RAF to avoid queueing stale focus calls
// from rapid arrow key presses
let pendingFocusFrame = 0

export const scheduleKeyboardFocusRestore = (itemId: string) =>
{
  if (typeof requestAnimationFrame === 'undefined')
  {
    focusItemById(itemId)
    return
  }

  cancelAnimationFrame(pendingFocusFrame)
  pendingFocusFrame = requestAnimationFrame(() => focusItemById(itemId))
}

export const focusKeyboardBoardRegion = () =>
{
  if (typeof requestAnimationFrame === 'undefined')
  {
    focusBoardRegion()
    return
  }

  cancelAnimationFrame(pendingFocusFrame)
  pendingFocusFrame = requestAnimationFrame(() => focusBoardRegion())
}
