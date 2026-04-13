// src/shared/overlay/usePopupClose.ts
// closes a fixed-position popup on outside click, Escape, or scroll

import type { RefObject } from 'react'
import { useDismissibleLayer } from './useDismissibleLayer'

interface UsePopupCloseOptions
{
  // whether the popup is currently visible
  show: boolean
  // button that opens the popup (excluded from outside-click detection)
  triggerRef?: RefObject<HTMLElement | null>
  // the popup container element
  popupRef: RefObject<HTMLElement | null>
  // extra elements treated as inside the popup interaction zone
  ignoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>
  // called to close the popup
  onClose: () => void
  // whether Escape should close the popup
  closeOnEscape?: boolean
  // whether outside interaction should close the popup
  closeOnInteractOutside?: boolean
  // phase used for the Escape key listener
  escapePhase?: 'capture' | 'bubble'
  // whether Escape handling should stop propagation
  stopEscapePropagation?: boolean
  // called on scroll so the caller can reposition the popup
  onScroll?: () => void
}

export const usePopupClose = ({
  show,
  triggerRef,
  popupRef,
  ignoreRefs = [],
  onClose,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  escapePhase = 'bubble',
  stopEscapePropagation = false,
  onScroll,
}: UsePopupCloseOptions) =>
{
  useDismissibleLayer({
    open: show,
    layerRef: popupRef,
    triggerRef,
    ignoreRefs,
    onDismiss: onClose,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onPositionUpdate: onScroll,
  })
}
