// src/shared/overlay/useAnchoredPopup.ts
// shared fixed-popup hook — anchored positioning + outside-click/Escape dismissal

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'

import { useDismissibleLayer } from './useDismissibleLayer'

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
  ignoreRefs,
  onClose,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  escapePhase = 'bubble',
  stopEscapePropagation = false,
  computePosition,
}: UseAnchoredPopupOptions) =>
{
  const [style, setStyle] = useState<CSSProperties>({})
  const computeRef = useRef(computePosition)

  useEffect(() =>
  {
    computeRef.current = computePosition
  }, [computePosition])

  const updatePosition = useCallback(() =>
  {
    const nextStyle = computeRef.current()

    if (nextStyle)
    {
      setStyle(nextStyle)
    }
  }, [])

  useDismissibleLayer({
    open,
    layerRef: popupRef,
    triggerRef,
    ignoreRefs,
    onDismiss: onClose,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onPositionUpdate: updatePosition,
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
