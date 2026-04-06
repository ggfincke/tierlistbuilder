// src/components/board/ItemEditPopover.tsx
// popover for editing item alt text

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'

import { useAnchoredPopup } from '../../hooks/useAnchoredPopup'
import { useTierListStore } from '../../store/useTierListStore'
import {
  ITEM_EDIT_POPOVER_MIN_HEIGHT_PX,
  ITEM_EDIT_POPOVER_WIDTH_PX,
} from '../../utils/uiMeasurements'
import { computeItemEditPopoverStyle } from '../../utils/popupPosition'
import { OverlayFixedPopupSurface } from '../ui/OverlayPrimitives'
import { SecondaryButton } from '../ui/SecondaryButton'
import { TextInput } from '../ui/TextInput'

interface ItemEditPopoverProps
{
  itemId: string
  anchorRef: RefObject<HTMLDivElement | null>
  triggerRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
}

export const ItemEditPopover = ({
  itemId,
  anchorRef,
  triggerRef,
  onClose,
}: ItemEditPopoverProps) =>
{
  const item = useTierListStore((s) => s.items[itemId])
  const setItemAltText = useTierListStore((s) => s.setItemAltText)

  const [altText, setAltText] = useState(item?.altText ?? '')
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const inputId = useId()
  const hintId = useId()

  const handleClose = useCallback(() =>
  {
    if (item)
    {
      const trimmedAlt = altText.trim()
      if ((trimmedAlt || '') !== (item.altText || ''))
      {
        setItemAltText(itemId, trimmedAlt)
      }
    }
    onClose()
  }, [item, altText, itemId, setItemAltText, onClose])

  const { style: popoverStyle, updatePosition } = useAnchoredPopup({
    open: true,
    triggerRef,
    popupRef: popoverRef,
    onClose: handleClose,
    stopEscapePropagation: true,
    computePosition: () =>
    {
      if (!anchorRef.current)
      {
        return null
      }

      return computeItemEditPopoverStyle(
        anchorRef.current.getBoundingClientRect(),
        popoverRef.current?.getBoundingClientRect().width ??
          ITEM_EDIT_POPOVER_WIDTH_PX,
        popoverRef.current?.getBoundingClientRect().height ??
          ITEM_EDIT_POPOVER_MIN_HEIGHT_PX
      )
    },
  })

  // auto-focus input on open
  useEffect(() =>
  {
    inputRef.current?.focus()
  }, [])

  useEffect(() =>
  {
    if (!anchorRef.current || !popoverRef.current)
    {
      return
    }

    // remeasure when either the anchor tile or the popover size changes
    const resizeObserver = new ResizeObserver(() => updatePosition())
    resizeObserver.observe(anchorRef.current)
    resizeObserver.observe(popoverRef.current)

    return () => resizeObserver.disconnect()
  }, [anchorRef, updatePosition])

  if (!item)
  {
    return null
  }

  return (
    <OverlayFixedPopupSurface
      ref={popoverRef}
      role="dialog"
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className="fixed z-50 w-56 p-3"
      style={popoverStyle}
    >
      <label
        id={labelId}
        htmlFor={inputId}
        className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-faint)]"
      >
        Alt Text
      </label>
      <TextInput
        ref={inputRef}
        id={inputId}
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        placeholder="Alt text for screen readers..."
        maxLength={200}
        aria-describedby={hintId}
        size="xs"
        className="w-full"
      />
      <p id={hintId} className="sr-only">
        Maximum 200 characters
      </p>

      <div className="mt-2 flex justify-end">
        <SecondaryButton size="sm" variant="surface" onClick={handleClose}>
          Done
        </SecondaryButton>
      </div>
    </OverlayFixedPopupSurface>
  )
}
