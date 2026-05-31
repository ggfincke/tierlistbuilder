// src/shared/ui/settings/SegmentedChoice.tsx
// card-style segmented radio choices w/ title + hint copy

import { useMemo } from 'react'
import { Check } from 'lucide-react'

import { joinClassNames } from '~/shared/lib/className'
import { useRovingSelection } from '~/shared/selection/useRovingSelection'

export interface SegmentedChoiceOption<TValue extends string>
{
  value: TValue
  label: string
  hint: string
}

interface SegmentedChoiceProps<TValue extends string>
{
  value: TValue
  options: readonly SegmentedChoiceOption<TValue>[]
  onChange: (value: TValue) => void
  disabled?: boolean
  label: string
  columns?: number
}

export const SegmentedChoice = <TValue extends string>({
  value,
  options,
  onChange,
  disabled = false,
  label,
  columns = 2,
}: SegmentedChoiceProps<TValue>) =>
{
  const keys = useMemo(() => options.map((option) => option.value), [options])
  const { groupProps, getItemProps, isActive } =
    useRovingSelection<TValue>({
      items: keys,
      activeKey: value,
      onSelect: onChange,
      kind: 'radio',
      groupLabel: label,
      columns,
    })

  return (
    <div
      {...groupProps}
      className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-1"
    >
      {options.map((option, index) =>
      {
        const selected = isActive(option.value)
        return (
          <button
            key={option.value}
            {...getItemProps(option.value, index)}
            disabled={disabled}
            className={joinClassNames(
              'relative min-h-[64px] rounded-md px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'bg-[var(--t-bg-surface)] text-[var(--t-text)] shadow-[0_0_0_1px_var(--t-accent)]'
                : 'text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)]'
            )}
          >
            {selected && (
              <span className="absolute right-2 top-2 text-[var(--t-accent)]">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
            <span className="block text-[12px] font-bold leading-tight">
              {option.label}
            </span>
            <span className="mt-1 block text-[10px] leading-snug text-[var(--t-text-faint)]">
              {option.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}
