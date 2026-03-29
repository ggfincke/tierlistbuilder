// src/components/board/TierLabel.tsx
// inline-editable tier label cell w/ auto contrast text color

import { memo } from 'react'
import type { Tier } from '../../types'
import { resolveTierColorSpec } from '../../domain/tierColors'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { useEffect, useRef, useState } from 'react'
import { BoardLabelCellFrame } from './BoardPrimitives'

interface TierLabelProps
{
  // tier whose name & color this label displays
  tier: Tier
  // transient color override for live preview while the custom picker is open
  colorOverride?: string | null
}

// resize the editor to the wrapped text height so typing matches the saved label layout
const resizeEditor = (textarea: HTMLTextAreaElement | null) =>
{
  if (!textarea)
  {
    return
  }

  textarea.style.height = '0px'
  textarea.style.height = `${textarea.scrollHeight}px`
}

export const TierLabel = memo(({ tier, colorOverride }: TierLabelProps) =>
{
  const paletteId = useCurrentPaletteId()
  const displayColor =
    colorOverride ?? resolveTierColorSpec(paletteId, tier.colorSpec)
  const renameTier = useTierListStore((state) => state.renameTier)
  const itemSize = useSettingsStore((state) => state.itemSize)
  const labelWidth = useSettingsStore((state) => state.labelWidth)
  const tierLabelBold = useSettingsStore((state) => state.tierLabelBold)
  const tierLabelItalic = useSettingsStore((state) => state.tierLabelItalic)
  const tierLabelFontSize = useSettingsStore((state) => state.tierLabelFontSize)

  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(tier.name)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  // capture name before editing starts so cancel can restore it
  const previousNameRef = useRef(tier.name)
  // signal whether blur should save or cancel (set before blur fires)
  const blurActionRef = useRef<'save' | 'cancel' | null>(null)

  // focus, select, & resize when editing starts; resize on text changes
  const wasEditingRef = useRef(false)
  useEffect(() =>
  {
    if (!isEditing)
    {
      wasEditingRef.current = false
      return
    }

    if (!wasEditingRef.current)
    {
      wasEditingRef.current = true
      inputRef.current?.focus()
      inputRef.current?.select()
    }

    resizeEditor(inputRef.current)
  }, [isEditing, draftName])

  // snapshot current name & switch to edit mode
  const beginEditing = () =>
  {
    previousNameRef.current = tier.name
    setDraftName(tier.name)
    setIsEditing(true)
  }

  // persist the draft name if it changed & is non-empty, then exit edit mode
  const finishEditing = () =>
  {
    const nextName = draftName.trim()

    if (nextName && nextName !== tier.name)
    {
      renameTier(tier.id, nextName)
    }

    // fall back to previous name if draft is blank
    setDraftName(nextName || previousNameRef.current)
    setIsEditing(false)
  }

  // restore the pre-edit name & exit without saving
  const cancelEditing = () =>
  {
    setDraftName(previousNameRef.current)
    setIsEditing(false)
  }

  return (
    <BoardLabelCellFrame
      color={displayColor}
      itemSize={itemSize}
      labelWidth={labelWidth}
      tierLabelBold={tierLabelBold}
      tierLabelItalic={tierLabelItalic}
      tierLabelFontSize={tierLabelFontSize}
    >
      {isEditing ? (
        <div className="flex h-full w-full items-center justify-center">
          <textarea
            ref={inputRef}
            value={draftName}
            onChange={(event) =>
              {
              setDraftName(event.target.value)
              resizeEditor(event.target)
            }}
            onBlur={() =>
              {
              // read the action set by Enter/Escape before blur fires
              const action = blurActionRef.current
              blurActionRef.current = null

              if (action === 'cancel')
                {
                cancelEditing()
                return
              }

              finishEditing()
            }}
            onKeyDown={(event) =>
              {
              if (event.key === 'Enter')
                {
                event.preventDefault()
                blurActionRef.current = 'save'
                event.currentTarget.blur()
              }

              if (event.key === 'Escape')
                {
                event.preventDefault()
                blurActionRef.current = 'cancel'
                event.currentTarget.blur()
              }
            }}
            aria-label={`Rename ${tier.name} tier`}
            rows={1}
            className="block max-h-full w-full resize-none overflow-hidden bg-transparent text-center leading-tight outline-none placeholder:text-current/55 [overflow-wrap:anywhere]"
            spellCheck={false}
          />
        </div>
      ) : (
        // click anywhere on the label to enter edit mode
        <button
          type="button"
          onClick={beginEditing}
          aria-label={`Edit ${tier.name} tier label`}
          className="flex h-full w-full cursor-text items-center justify-center text-center leading-tight outline-none"
        >
          <span className="block max-w-full break-words [overflow-wrap:anywhere]">
            {tier.name}
          </span>
        </button>
      )}
    </BoardLabelCellFrame>
  )
})
