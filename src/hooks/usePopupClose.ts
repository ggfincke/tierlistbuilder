// src/hooks/usePopupClose.ts
// closes a fixed-position popup on outside click, Escape, or scroll
import { useEffect, type RefObject } from 'react'

interface UsePopupCloseOptions {
  // whether the popup is currently visible
  show: boolean
  // button that opens the popup (excluded from outside-click detection)
  triggerRef: RefObject<HTMLElement | null>
  // the popup container element
  popupRef: RefObject<HTMLElement | null>
  // called to close the popup
  onClose: () => void
  // called on scroll so the caller can reposition the popup
  onScroll?: () => void
}

export const usePopupClose = ({
  show,
  triggerRef,
  popupRef,
  onClose,
  onScroll,
}: UsePopupCloseOptions) => {
  useEffect(() => {
    if (!show) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!popupRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const handleScroll = () => onScroll?.()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    if (onScroll) window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      if (onScroll) window.removeEventListener('scroll', handleScroll, true)
    }
  }, [show, triggerRef, popupRef, onClose, onScroll])
}
