// src/shared/overlay/useAnchoredPopup.ts
// shared fixed-popup hook that composes anchored positioning w/ popup dismissal

import { useLayoutEffect, type CSSProperties, type RefObject } from 'react'

import { useAnchoredPosition } from './useAnchoredPosition'
import { usePopupClose } from './usePopupClose'

interface UseAnchoredPopupOptions
{
  open: boolean
  triggerRef?: RefObject<HTMLElement | null>
  popupRef: RefObject<HTMLElement | null>
  ignoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>
  onClose: () => void
  closeOnEscape?: boolean
  closeOnInteractOutside?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
  computePosition: () => CSSProperties | null
}

export const useAnchoredPopup = ({
  open,
  triggerRef,
  popupRef,
  ignoreRefs = [],
  onClose,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  escapePhase = 'bubble',
  stopEscapePropagation = false,
  computePosition,
}: UseAnchoredPopupOptions) =>
{
  const { style, updatePosition } = useAnchoredPosition({
    computePosition,
  })

  usePopupClose({
    show: open,
    triggerRef,
    popupRef,
    ignoreRefs,
    onClose,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onScroll: updatePosition,
  })

  useLayoutEffect(() =>
  {
    if (!open)
    {
      return
    }

    updatePosition()
  }, [open, updatePosition])

  return {
    style,
    updatePosition,
  }
}
