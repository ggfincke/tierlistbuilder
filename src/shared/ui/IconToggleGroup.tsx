// src/shared/ui/IconToggleGroup.tsx
// compact icon-only radio group for toolbar-style view & density toggles

import type { LucideIcon } from 'lucide-react'

import { joinClassNames } from '~/shared/lib/className'

export interface IconToggleOption<T extends string>
{
  value: T
  label: string
  Icon: LucideIcon
}

interface IconToggleGroupProps<T extends string>
{
  value: T
  options: readonly IconToggleOption<T>[]
  onChange: (next: T) => void
  ariaLabel: string
  className?: string
}

const GROUP_CLASS =
  'flex items-center gap-0.5 rounded-md border border-[var(--t-border)] p-1'

const BUTTON_BASE =
  'focus-custom flex h-6 w-6 items-center justify-center rounded transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

const BUTTON_ACTIVE = 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'

const BUTTON_INACTIVE = 'text-[var(--t-text-muted)] hover:text-[var(--t-text)]'

export const IconToggleGroup = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: IconToggleGroupProps<T>) => (
  <div
    className={joinClassNames(GROUP_CLASS, className)}
    role="radiogroup"
    aria-label={ariaLabel}
  >
    {options.map(({ value: id, label, Icon }) =>
    {
      const active = value === id
      return (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          className={joinClassNames(
            BUTTON_BASE,
            active ? BUTTON_ACTIVE : BUTTON_INACTIVE
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
        </button>
      )
    })}
  </div>
)
