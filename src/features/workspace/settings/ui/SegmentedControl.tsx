// src/features/workspace/settings/ui/SegmentedControl.tsx
// reusable segmented control for selecting between discrete options

import { useMemo } from 'react'

import type { ReactNode } from 'react'

import { useRovingSelection } from '~/shared/selection/useRovingSelection'

interface SegmentedControlOption<T extends string>
{
  value: T
  label: ReactNode
  ariaLabel?: string
  disabled?: boolean
  title?: string
}

interface SegmentedControlProps<T extends string>
{
  options: SegmentedControlOption<T>[]
  // null leaves no segment highlighted; useful when an external action (e.g.
  // auto-crop) supersedes the choice this control represents
  value: T | null
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
  // tabstop lands on the selected segment if enabled, else the first enabled
  // one — disabled buttons won't accept focus() so don't route nav there
  const firstEnabledKey = options.find((o) => !o.disabled)?.value ?? keys[0]
  const valueIsEnabled =
    value !== null && options.some((o) => o.value === value && !o.disabled)
  const rovingActiveKey = valueIsEnabled ? (value as T) : firstEnabledKey
  const { getItemProps, groupProps } = useRovingSelection({
    items: keys,
    activeKey: rovingActiveKey,
    onSelect: onChange,
    kind: 'radio',
    groupLabelledby: ariaLabelledby,
    groupLabel: ariaLabel,
  })

  return (
    <div
      {...groupProps}
      className="inline-flex rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]"
    >
      {options.map((opt, index) => (
        <button
          key={opt.value}
          {...getItemProps(opt.value, index)}
          // override aria-checked so null value reports no checked segment,
          // even though we kept a tabstop on the first option
          aria-checked={value === opt.value}
          aria-label={opt.ariaLabel}
          disabled={opt.disabled}
          title={opt.title}
          className={`focus-custom px-3 py-1 text-xs font-medium transition-colors first:rounded-l-[7px] last:rounded-r-[7px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
            value === opt.value
              ? 'bg-[var(--t-bg-active)] text-[var(--t-text)]'
              : 'text-[var(--t-text-faint)] enabled:hover:text-[var(--t-text-secondary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
