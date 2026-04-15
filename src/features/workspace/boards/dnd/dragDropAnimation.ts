// src/features/workspace/boards/dnd/dragDropAnimation.ts
// FLIP animation for multi-drag drop — items fan out from the stacked
// overlay position to their final grid slots w/ staggered timing

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

const DURATION_MS = 300
const STAGGER_MS = 30

interface AnimateDropDistributeOptions
{
  reducedMotion: boolean
}

// animate dropped items from a shared origin (the overlay position) to
// their final resting positions; called after commitDragPreview settles
export const animateDropDistribute = (
  itemIds: ItemId[],
  originX: number,
  originY: number,
  { reducedMotion }: AnimateDropDistributeOptions
) =>
{
  if (itemIds.length < 2) return

  if (reducedMotion) return

  // double-rAF ensures React has flushed the commit & secondary items
  // are rendered in the DOM before we measure positions
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
    {
      const targets: { el: HTMLElement; dx: number; dy: number }[] = []

      for (const id of itemIds)
      {
        const el = document.querySelector(
          `[data-item-id="${id}"]`
        ) as HTMLElement | null
        if (!el) continue

        const rect = el.getBoundingClientRect()
        targets.push({
          el,
          dx: originX - rect.left,
          dy: originY - rect.top,
        })
      }

      if (targets.length === 0) return

      // batch all starting positions in one pass (no interleaved reflows)
      for (const { el, dx, dy } of targets)
      {
        el.style.transition = 'none'
        el.style.translate = `${dx}px ${dy}px`
        el.style.opacity = '0'
      }

      // single forced reflow to flush all starting positions
      targets[0].el.getBoundingClientRect()

      // batch all end-state transitions
      for (let i = 0; i < targets.length; i++)
      {
        const { el } = targets[i]
        const delay = i * STAGGER_MS

        el.style.transition = [
          `translate ${DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
          `opacity ${DURATION_MS * 0.5}ms ease ${delay}ms`,
        ].join(', ')
        el.style.translate = ''
        el.style.opacity = ''
      }

      // clean up inline styles when the last item's translate transition
      // ends, w/ a setTimeout safety net in case the event is missed (tab
      // backgrounded mid-drop, parent unmounted, etc.)
      const lastEl = targets[targets.length - 1].el
      const cleanup = () =>
      {
        lastEl.removeEventListener('transitionend', handleTransitionEnd)
        clearTimeout(safetyTimer)
        for (const { el } of targets)
        {
          el.style.transition = ''
          el.style.translate = ''
          el.style.opacity = ''
        }
      }
      const handleTransitionEnd = (event: TransitionEvent) =>
      {
        if (event.propertyName === 'translate' && event.target === lastEl)
        {
          cleanup()
        }
      }
      lastEl.addEventListener('transitionend', handleTransitionEnd)
      const totalMs = DURATION_MS + (targets.length - 1) * STAGGER_MS + 100
      const safetyTimer = setTimeout(cleanup, totalMs)
    })
  )
}
