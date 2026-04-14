// src/shared/overlay/useDismissibleLayer.ts
// shared dismissal mechanics for popups, menus, panels, & dialogs

import { useEffect, type RefObject } from 'react'

import { hasActiveModalLayer } from './useModalBackgroundInert'

// shared empty array — avoids allocating a fresh array per render when callers
// omit `ignoreRefs`, which would otherwise force the effect to re-subscribe
const EMPTY_IGNORE_REFS: ReadonlyArray<RefObject<HTMLElement | null>> = []

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
  useEffect(() =>
  {
    if (!open)
    {
      return
    }

    const isInsideManagedElement = (target: Node): boolean =>
    {
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

    const handlePositionUpdate = () => onPositionUpdate?.()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener(
      'keydown',
      handleKeyDown,
      escapePhase === 'capture'
    )

    if (onPositionUpdate)
    {
      window.addEventListener('scroll', handlePositionUpdate, true)
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

      if (onPositionUpdate)
      {
        window.removeEventListener('scroll', handlePositionUpdate, true)
        window.removeEventListener('resize', handlePositionUpdate)
      }
    }
  }, [
    open,
    layerRef,
    triggerRef,
    ignoreRefs,
    onDismiss,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onPositionUpdate,
  ])
}
