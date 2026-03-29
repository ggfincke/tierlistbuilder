// src/hooks/__tests__/useDismissibleLayer.test.tsx
// @vitest-environment jsdom
// unit tests for shared dismissal mechanics across overlays

import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDismissibleLayer } from '../useDismissibleLayer'

interface HarnessProps
{
  onDismiss: () => void
  onPositionUpdate?: () => void
  stopEscapePropagation?: boolean
  escapePhase?: 'capture' | 'bubble'
}

const Harness = ({
  onDismiss,
  onPositionUpdate,
  stopEscapePropagation = false,
  escapePhase = 'bubble',
}: HarnessProps) =>
{
  const layerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useDismissibleLayer({
    open: true,
    layerRef,
    triggerRef,
    onDismiss,
    onPositionUpdate,
    stopEscapePropagation,
    escapePhase,
  })

  return (
    <div>
      <button ref={triggerRef}>trigger</button>
      <div ref={layerRef} data-testid="layer">
        layer
      </div>
      <div data-testid="outside">outside</div>
    </div>
  )
}

let container: HTMLDivElement | null = null
let root: Root | null = null

const renderHarness = async (props: HarnessProps) =>
{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () =>
  {
    root!.render(<Harness {...props} />)
  })
}

afterEach(async () =>
{
  if (root)
  {
    await act(async () =>
    {
      root!.unmount()
    })
  }

  root = null
  container?.remove()
  container = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('useDismissibleLayer', () =>
{
  it('dismisses on outside pointer presses but not on layer presses', async () =>
  {
    const onDismiss = vi.fn()
    await renderHarness({ onDismiss })

    document
      .querySelector('[data-testid="outside"]')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    expect(onDismiss).toHaveBeenCalledTimes(1)

    document
      .querySelector('[data-testid="layer"]')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('repositions on scroll & resize when a callback is provided', async () =>
  {
    const onDismiss = vi.fn()
    const onPositionUpdate = vi.fn()
    await renderHarness({ onDismiss, onPositionUpdate })

    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))

    expect(onPositionUpdate).toHaveBeenCalledTimes(2)
  })

  it('can stop Escape propagation in capture phase', async () =>
  {
    const onDismiss = vi.fn()
    const bubbleListener = vi.fn()
    document.addEventListener('keydown', bubbleListener)

    await renderHarness({
      onDismiss,
      stopEscapePropagation: true,
      escapePhase: 'capture',
    })

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(bubbleListener).not.toHaveBeenCalled()

    document.removeEventListener('keydown', bubbleListener)
  })
})
