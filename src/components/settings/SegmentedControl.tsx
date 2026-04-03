// src/components/settings/SegmentedControl.tsx
// reusable segmented control for selecting between discrete options

import { useRef } from 'react'

import {
  resolveNextSelectionIndex,
  type SelectionNavigationKey,
} from '../../utils/selectionNavigation'

interface SegmentedControlProps<T extends string>
{
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabelledby?: string
  ariaLabel?: string
}

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  ariaLabelledby,
  ariaLabel,
}: SegmentedControlProps<T>) =>
{
  const optionRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
      className="flex rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]"
    >
      {options.map((opt, index) => (
        <button
          key={opt.value}
          ref={(node) =>
          {
            optionRefs.current[opt.value] = node
          }}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={value === opt.value ? 0 : -1}
          onClick={() => onChange(opt.value)}
          onKeyDown={(event) =>
          {
            const key = event.key as SelectionNavigationKey

            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key))
            {
              return
            }

            const nextIndex = resolveNextSelectionIndex({
              currentIndex: index,
              itemCount: options.length,
              key,
              columns: options.length,
            })

            if (nextIndex === null)
            {
              return
            }

            event.preventDefault()

            const nextOption = options[nextIndex]
            onChange(nextOption.value)
            optionRefs.current[nextOption.value]?.focus()
          }}
          className={`focus-custom px-3 py-1 text-xs font-medium transition-colors first:rounded-l-[7px] last:rounded-r-[7px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] ${
            value === opt.value
              ? 'bg-[var(--t-bg-active)] text-[var(--t-text)]'
              : 'text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
