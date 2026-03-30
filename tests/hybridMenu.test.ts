import { describe, expect, it } from 'vitest'
import {
  INITIAL_HYBRID_MENU_STATE,
  reduceHybridMenuState,
  supportsHoverOpen,
} from '../src/hooks/useHybridMenu'

describe('supportsHoverOpen', () =>
{
  it('allows hover-open for mouse & pen pointers', () =>
  {
    expect(supportsHoverOpen('mouse')).toBe(true)
    expect(supportsHoverOpen('pen')).toBe(true)
  })

  it('ignores touch pointers for hover-open', () =>
  {
    expect(supportsHoverOpen('touch')).toBe(false)
    expect(supportsHoverOpen(undefined)).toBe(false)
  })
})

describe('reduceHybridMenuState', () =>
{
  it('opens on fine-pointer hover', () =>
  {
    const result = reduceHybridMenuState(INITIAL_HYBRID_MENU_STATE, {
      type: 'pointer-enter',
      pointerType: 'mouse',
    })

    expect(result).toEqual({
      open: true,
      pinned: false,
      closePending: false,
    })
  })

  it('starts a delayed close on pointer leave', () =>
  {
    const hovered = reduceHybridMenuState(INITIAL_HYBRID_MENU_STATE, {
      type: 'pointer-enter',
      pointerType: 'mouse',
    })
    const result = reduceHybridMenuState(hovered, {
      type: 'pointer-leave',
    })

    expect(result).toEqual({
      open: true,
      pinned: false,
      closePending: true,
    })
  })

  it('cancels a pending close when the pointer re-enters quickly', () =>
  {
    const pendingClose = reduceHybridMenuState(
      {
        open: true,
        pinned: false,
        closePending: false,
      },
      {
        type: 'pointer-leave',
      }
    )
    const result = reduceHybridMenuState(pendingClose, {
      type: 'pointer-enter',
      pointerType: 'mouse',
    })

    expect(result).toEqual({
      open: true,
      pinned: false,
      closePending: false,
    })
  })

  it('pins the menu open on click after hover-open', () =>
  {
    const hovered = reduceHybridMenuState(INITIAL_HYBRID_MENU_STATE, {
      type: 'pointer-enter',
      pointerType: 'mouse',
    })
    const result = reduceHybridMenuState(hovered, {
      type: 'toggle',
    })

    expect(result).toEqual({
      open: true,
      pinned: true,
      closePending: false,
    })
  })

  it('closes once the delayed timeout fires', () =>
  {
    const result = reduceHybridMenuState(
      {
        open: true,
        pinned: false,
        closePending: true,
      },
      {
        type: 'close-timeout',
      }
    )

    expect(result).toEqual(INITIAL_HYBRID_MENU_STATE)
  })

  it('clears the pinned state on dismiss', () =>
  {
    const result = reduceHybridMenuState(
      {
        open: true,
        pinned: true,
        closePending: false,
      },
      {
        type: 'dismiss',
      }
    )

    expect(result).toEqual(INITIAL_HYBRID_MENU_STATE)
  })
})
