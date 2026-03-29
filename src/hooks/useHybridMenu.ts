// src/hooks/useHybridMenu.ts
// shared hover + click menu state for action-bar menus & nested submenus

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

// menu open state
export interface HybridMenuState
{
  // render the menu surface
  open: boolean
  // keep the menu open until explicitly dismissed
  pinned: boolean
  // wait for the close timer before dismissing
  closePending: boolean
}

export type HybridMenuAction =
  | {
      type: 'pointer-enter'
      pointerType?: string
    }
  | {
      type: 'pointer-leave'
    }
  | {
      type: 'close-timeout'
    }
  | {
      type: 'toggle'
    }
  | {
      type: 'dismiss'
    }

export const HYBRID_MENU_CLOSE_DELAY_MS = 120

export const INITIAL_HYBRID_MENU_STATE: HybridMenuState = {
  open: false,
  pinned: false,
  closePending: false,
}

// allow hover-open only for fine pointers
export const supportsHoverOpen = (pointerType?: string): boolean =>
  pointerType === 'mouse' || pointerType === 'pen'

// update menu state for hover, click, timeout, & dismiss flows
export const reduceHybridMenuState = (
  state: HybridMenuState,
  action: HybridMenuAction
): HybridMenuState =>
{
  switch (action.type)
  {
    case 'pointer-enter':
    {
      if (!supportsHoverOpen(action.pointerType))
      {
        return state.closePending ? { ...state, closePending: false } : state
      }

      return {
        open: true,
        pinned: state.pinned,
        closePending: false,
      }
    }

    case 'pointer-leave':
    {
      if (!state.open || state.pinned)
      {
        return state.closePending ? { ...state, closePending: false } : state
      }

      return { ...state, closePending: true }
    }

    case 'close-timeout':
    {
      if (!state.closePending || state.pinned)
      {
        return state.closePending ? { ...state, closePending: false } : state
      }

      return INITIAL_HYBRID_MENU_STATE
    }

    case 'toggle':
    {
      if (!state.open)
      {
        return {
          open: true,
          pinned: true,
          closePending: false,
        }
      }

      if (!state.pinned)
      {
        return {
          open: true,
          pinned: true,
          closePending: false,
        }
      }

      return INITIAL_HYBRID_MENU_STATE
    }

    case 'dismiss':
    {
      return INITIAL_HYBRID_MENU_STATE
    }
  }
}

interface UseHybridMenuOptions
{
  disabled?: boolean
  closeDelayMs?: number
}

export const useHybridMenu = ({
  disabled = false,
  closeDelayMs = HYBRID_MENU_CLOSE_DELAY_MS,
}: UseHybridMenuOptions = {}) =>
{
  const [state, setState] = useState(INITIAL_HYBRID_MENU_STATE)
  const closeTimerRef = useRef<number | null>(null)

  // cancel any pending close timeout before changing interaction mode
  const clearCloseTimer = useCallback(() =>
  {
    if (closeTimerRef.current === null)
    {
      return
    }

    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const dispatchAction = useCallback((action: HybridMenuAction) =>
  {
    setState((current) => reduceHybridMenuState(current, action))
  }, [])

  // close the menu tree immediately
  const closeMenu = useCallback(() =>
  {
    clearCloseTimer()
    dispatchAction({ type: 'dismiss' })
  }, [clearCloseTimer, dispatchAction])

  // start the delayed hover close when the pointer leaves
  const scheduleClose = useCallback(() =>
  {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() =>
    {
      closeTimerRef.current = null
      dispatchAction({ type: 'close-timeout' })
    }, closeDelayMs)
  }, [clearCloseTimer, closeDelayMs, dispatchAction])

  // update hover-driven open state from pointer movement
  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) =>
    {
      if (disabled)
      {
        return
      }

      clearCloseTimer()
      dispatchAction({
        type: 'pointer-enter',
        pointerType: event.pointerType,
      })
    },
    [clearCloseTimer, disabled, dispatchAction]
  )

  // delay hover closes so short pointer gaps do not collapse the menu
  const handlePointerLeave = useCallback(() =>
  {
    if (disabled)
    {
      return
    }

    setState((current) =>
    {
      const next = reduceHybridMenuState(current, { type: 'pointer-leave' })

      if (next.closePending)
      {
        scheduleClose()
      }
      else
      {
        clearCloseTimer()
      }

      return next
    })
  }, [clearCloseTimer, disabled, scheduleClose])

  // toggle the pinned-open state for click, tap, & keyboard activation
  const togglePinnedOpen = useCallback(() =>
  {
    if (disabled)
    {
      return
    }

    clearCloseTimer()
    dispatchAction({ type: 'toggle' })
  }, [clearCloseTimer, disabled, dispatchAction])

  useEffect(() =>
  {
    if (disabled && state.open)
    {
      clearCloseTimer()

      const dismissTimer = window.setTimeout(() =>
      {
        dispatchAction({ type: 'dismiss' })
      }, 0)

      return () => window.clearTimeout(dismissTimer)
    }
  }, [clearCloseTimer, disabled, dispatchAction, state.open])

  useEffect(
    () => () =>
    {
      clearCloseTimer()
    },
    [clearCloseTimer]
  )

  return {
    open: state.open,
    pinned: state.pinned,
    closeMenu,
    handlePointerEnter,
    handlePointerLeave,
    togglePinnedOpen,
  }
}
