// src/features/workspace/settings/ui/SegmentedControl.tsx
// reusable segmented control for selecting between discrete options

import { useMemo } from 'react'

import type { ReactNode } from 'react'

import { useRovingSelection } from '~/shared/selection/useRovingSelection'

interface SegmentedControlProps<T extends string>
{
  options: { value: T; label: ReactNode; ariaLabel?: string }[]
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
  const keys = useMemo(() => options.map((o) => o.value), [options])
  const { getItemProps, groupProps, isActive } = useRovingSelection({
    items: keys,
    activeKey: value,
    onSelect: onChange,
    kind: 'radio',
    groupLabelledby: ariaLabelledby,
    groupLabel: ariaLabel,
  })

  return (
    <div
      {...groupProps}
      className="flex rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]"
    >
      {options.map((opt, index) => (
        <button
          key={opt.value}
          {...getItemProps(opt.value, index)}
          aria-label={opt.ariaLabel}
          className={`focus-custom px-3 py-1 text-xs font-medium transition-colors first:rounded-l-[7px] last:rounded-r-[7px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] ${
            isActive(opt.value)
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
