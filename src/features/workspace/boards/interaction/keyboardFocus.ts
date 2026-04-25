// src/features/workspace/boards/interaction/keyboardFocus.ts
// focus helpers for keyboard browse & drag mode

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  TIER_LIST_BOARD_SELECTOR,
  tierItemSelector,
} from '~/shared/board-ui/boardTestIds'

const focusBoardRegion = () =>
{
  if (typeof document === 'undefined')
  {
    return
  }

  const boardElement = document.querySelector<HTMLElement>(
    TIER_LIST_BOARD_SELECTOR
  )
  boardElement?.focus({ preventScroll: true })
}

const focusItemById = (itemId: ItemId) =>
{
  if (typeof document === 'undefined')
  {
    return
  }

  const itemElement = document.querySelector<HTMLElement>(
    tierItemSelector(itemId)
  )

  if (itemElement?.isConnected)
  {
    itemElement.focus({ preventScroll: true })
    return
  }

  focusBoardRegion()
}

// cancel the previous focus-restore RAF to avoid queueing stale focus calls
// from rapid arrow key presses
let pendingFocusFrame = 0

export const scheduleKeyboardFocusRestore = (itemId: ItemId) =>
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
