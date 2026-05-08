// src/shared/overlay/dismissibleLayer.ts
// outside interaction, Escape, & position-update handling for popups

import { useEffect, useRef, type RefObject } from 'react'

import { hasActiveModalLayer } from './modalLayer'

const EMPTY_IGNORE_REFS: ReadonlyArray<RefObject<HTMLElement | null>> = []
const SCROLL_LISTENER_OPTIONS = { capture: true, passive: true } as const

interface UseDismissibleLayerOptions
{
  open: boolean
  layerRef?: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  ignoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>
  onDismiss: () => void
  closeOnEscape?: boolean
  closeOnInteractOutside?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
  onPositionUpdate?: () => void
}

interface LatestDismissibleLayerOptions
{
  layerRef?: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  ignoreRefs: ReadonlyArray<RefObject<HTMLElement | null>>
  onDismiss: () => void
  closeOnEscape: boolean
  closeOnInteractOutside: boolean
  escapePhase: 'capture' | 'bubble'
  stopEscapePropagation: boolean
  onPositionUpdate?: () => void
}

export const useDismissibleLayer = ({
  open,
  layerRef,
  triggerRef,
  ignoreRefs = EMPTY_IGNORE_REFS,
  onDismiss,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  escapePhase = 'bubble',
  stopEscapePropagation = false,
  onPositionUpdate,
}: UseDismissibleLayerOptions) =>
{
  const latestRef = useRef<LatestDismissibleLayerOptions>({
    layerRef,
    triggerRef,
    ignoreRefs,
    onDismiss,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onPositionUpdate,
  })
  const hasPositionUpdate = onPositionUpdate !== undefined

  useEffect(() =>
  {
    latestRef.current = {
      layerRef,
      triggerRef,
      ignoreRefs,
      onDismiss,
      closeOnEscape,
      closeOnInteractOutside,
      escapePhase,
      stopEscapePropagation,
      onPositionUpdate,
    }
  })

  useEffect(() =>
  {
    if (!open)
    {
      return
    }

    const isInsideManagedElement = (target: Node): boolean =>
    {
      const { layerRef, triggerRef, ignoreRefs } = latestRef.current

      if (layerRef?.current?.contains(target))
      {
        return true
      }

      if (triggerRef?.current?.contains(target))
      {
        return true
      }

      return ignoreRefs.some((ref) => ref.current?.contains(target))
    }

    const isManagedInsideModal = (): boolean =>
    {
      const { layerRef, triggerRef, ignoreRefs } = latestRef.current
      const managedElements = [
        layerRef?.current,
        triggerRef?.current,
        ...ignoreRefs.map((ref) => ref.current),
      ]

      return managedElements.some((element) =>
        element?.closest('[aria-modal="true"]')
      )
    }

    const handlePointerDown = (event: PointerEvent) =>
    {
      const { closeOnInteractOutside, onDismiss } = latestRef.current

      if (hasActiveModalLayer() && !isManagedInsideModal())
      {
        return
      }

      if (!closeOnInteractOutside)
      {
        return
      }

      const target = event.target as Node | null

      if (!target || isInsideManagedElement(target))
      {
        return
      }

      onDismiss()
    }

    const handleKeyDown = (event: KeyboardEvent) =>
    {
      const { closeOnEscape, onDismiss, stopEscapePropagation } =
        latestRef.current

      if (event.defaultPrevented)
      {
        return
      }

      if (hasActiveModalLayer() && !isManagedInsideModal())
      {
        return
      }

      if (!closeOnEscape || event.key !== 'Escape')
      {
        return
      }

      if (stopEscapePropagation)
      {
        event.stopPropagation()
      }

      onDismiss()
    }

    const handlePositionUpdate = () => latestRef.current.onPositionUpdate?.()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener(
      'keydown',
      handleKeyDown,
      escapePhase === 'capture'
    )

    if (hasPositionUpdate)
    {
      window.addEventListener(
        'scroll',
        handlePositionUpdate,
        SCROLL_LISTENER_OPTIONS
      )
      window.addEventListener('resize', handlePositionUpdate)
    }

    return () =>
    {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener(
        'keydown',
        handleKeyDown,
        escapePhase === 'capture'
      )

      if (hasPositionUpdate)
      {
        window.removeEventListener(
          'scroll',
          handlePositionUpdate,
          SCROLL_LISTENER_OPTIONS
        )
        window.removeEventListener('resize', handlePositionUpdate)
      }
    }
  }, [open, escapePhase, hasPositionUpdate])
}
