// src/components/settings/TextStylePicker.tsx
// row of clickable text style previews for the Appearance section

import { useRef } from 'react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { TEXT_STYLES } from '../../theme'
import type { TextStyleId } from '../../types'
import {
  resolveNextSelectionIndex,
  type SelectionNavigationKey,
} from '../../utils/selectionNavigation'

const STYLE_OPTIONS: { id: TextStyleId; label: string }[] = [
  { id: 'default', label: 'Default (Inter)' },
  { id: 'mono', label: 'Mono' },
  { id: 'serif', label: 'Serif' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'display', label: 'Display' },
]

interface TextStylePickerProps
{
  ariaLabelledby?: string
}

export const TextStylePicker = ({ ariaLabelledby }: TextStylePickerProps) =>
{
  const textStyleId = useSettingsStore((s) => s.textStyleId)
  const setTextStyleId = useSettingsStore((s) => s.setTextStyleId)
  const optionRefs = useRef<
    Partial<Record<TextStyleId, HTMLButtonElement | null>>
  >({})

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabelledby ? undefined : 'Text style'}
      className="flex gap-2"
    >
      {STYLE_OPTIONS.map(({ id, label }, index) =>
      {
        const style = TEXT_STYLES[id]
        const isActive = id === textStyleId

        return (
          <button
            key={id}
            ref={(node) =>
            {
              optionRefs.current[id] = node
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setTextStyleId(id)}
            onKeyDown={(event) =>
            {
              const key = event.key as SelectionNavigationKey

              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key))
              {
                return
              }

              const nextIndex = resolveNextSelectionIndex({
                currentIndex: index,
                itemCount: STYLE_OPTIONS.length,
                key,
                columns: STYLE_OPTIONS.length,
              })

              if (nextIndex === null)
              {
                return
              }

              event.preventDefault()

              const nextStyleId = STYLE_OPTIONS[nextIndex].id
              setTextStyleId(nextStyleId)
              optionRefs.current[nextStyleId]?.focus()
            }}
            className={`focus-custom flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
              isActive
                ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                : 'hover:bg-[rgb(var(--t-overlay)/0.06)]'
            }`}
          >
            <span
              className="text-lg text-[var(--t-text)]"
              style={{
                fontFamily: style.fontFamily,
                fontWeight: Number(style.weightHeading),
              }}
            >
              Aa
            </span>
            <span className="text-[10px] text-[var(--t-text-faint)]">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
