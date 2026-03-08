// src/components/board/TierLabel.tsx
// inline-editable tier label cell w/ auto contrast text color
import type { Tier } from '../../types'
import { useTierListStore } from '../../store/useTierListStore'
import { getTextColor } from '../../utils/color'
import { useEffect, useRef, useState } from 'react'

interface TierLabelProps {
  // tier whose name & color this label displays
  tier: Tier
}

// resize the editor to the wrapped text height so typing matches the saved label layout
const resizeEditor = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) {
    return
  }

  textarea.style.height = '0px'
  textarea.style.height = `${textarea.scrollHeight}px`
}

export const TierLabel = ({ tier }: TierLabelProps) => {
  const renameTier = useTierListStore((state) => state.renameTier)
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(tier.name)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  // capture name before editing starts so cancel can restore it
  const previousNameRef = useRef(tier.name)
  // signal whether blur should save or cancel (set before blur fires)
  const blurActionRef = useRef<'save' | 'cancel' | null>(null)

  // focus, select, & resize when editing starts; resize on text changes
  const wasEditingRef = useRef(false)
  useEffect(() => {
    if (!isEditing) {
      wasEditingRef.current = false
      return
    }

    if (!wasEditingRef.current) {
      wasEditingRef.current = true
      inputRef.current?.focus()
      inputRef.current?.select()
    }

    resizeEditor(inputRef.current)
  }, [isEditing, draftName])

  // snapshot current name & switch to edit mode
  const beginEditing = () => {
    previousNameRef.current = tier.name
    setDraftName(tier.name)
    setIsEditing(true)
  }

  // persist the draft name if it changed & is non-empty, then exit edit mode
  const finishEditing = () => {
    const nextName = draftName.trim()

    if (nextName && nextName !== tier.name) {
      renameTier(tier.id, nextName)
    }

    // fall back to previous name if draft is blank
    setDraftName(nextName || previousNameRef.current)
    setIsEditing(false)
  }

  // restore the pre-edit name & exit without saving
  const cancelEditing = () => {
    setDraftName(previousNameRef.current)
    setIsEditing(false)
  }

  return (
    <div
      className="flex min-h-[104px] w-[118px] shrink-0 border-r border-[#444] transition-[filter,box-shadow] hover:brightness-[1.04] focus-within:brightness-[1.04] focus-within:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.16)]"
      style={{
        backgroundColor: tier.color,
        color: getTextColor(tier.color),
      }}
    >
      {isEditing ? (
        <div className="flex h-full w-full items-center justify-center px-3 py-2">
          <textarea
            ref={inputRef}
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value)
              resizeEditor(event.target)
            }}
            onBlur={() => {
              // read the action set by Enter/Escape before blur fires
              const action = blurActionRef.current
              blurActionRef.current = null

              if (action === 'cancel') {
                cancelEditing()
                return
              }

              finishEditing()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                blurActionRef.current = 'save'
                event.currentTarget.blur()
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                blurActionRef.current = 'cancel'
                event.currentTarget.blur()
              }
            }}
            aria-label={`Rename ${tier.name} tier`}
            rows={1}
            className="block max-h-full w-full resize-none overflow-hidden bg-transparent text-center text-[1.45rem] font-semibold leading-tight outline-none placeholder:text-current/55 [overflow-wrap:anywhere]"
            spellCheck={false}
          />
        </div>
      ) : (
        // click anywhere on the label to enter edit mode
        <button
          type="button"
          onClick={beginEditing}
          aria-label={`Edit ${tier.name} tier label`}
          className="flex h-full w-full cursor-text items-center justify-center px-3 py-2 text-center text-[1.45rem] font-semibold leading-tight outline-none"
        >
          <span className="block max-w-full break-words [overflow-wrap:anywhere]">
            {tier.name}
          </span>
        </button>
      )}
    </div>
  )
}
