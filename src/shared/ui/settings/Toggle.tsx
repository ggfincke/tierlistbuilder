// src/shared/ui/settings/Toggle.tsx
// reusable toggle switch component

interface ToggleProps
{
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  ariaLabelledby?: string
  ariaDescribedby?: string
  size?: 'default' | 'compact'
  tabIndex?: number
  'aria-hidden'?: boolean | 'true' | 'false'
  className?: string
}

export const Toggle = ({
  checked,
  onChange,
  disabled = false,
  ariaLabelledby,
  ariaDescribedby,
  size = 'default',
  tabIndex,
  'aria-hidden': ariaHidden,
  className = '',
}: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={ariaLabelledby}
    aria-describedby={ariaDescribedby}
    aria-hidden={ariaHidden}
    disabled={disabled}
    tabIndex={tabIndex}
    onClick={() => onChange(!checked)}
    className={`focus-custom relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-sunken)] ${
      size === 'compact' ? 'h-[18px] w-8' : 'h-5 w-9 max-sm:h-6 max-sm:w-11'
    } ${
      checked ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-secondary)]'
    } ${className}`}
  >
    <span
      className={`inline-block rounded-full bg-[var(--t-accent-foreground)] transition-transform ${
        size === 'compact' ? 'h-3 w-3' : 'h-3.5 w-3.5 max-sm:h-4 max-sm:w-4'
      } ${
        checked && size === 'compact'
          ? 'translate-x-[17px]'
          : checked
            ? 'translate-x-[18px] max-sm:translate-x-[22px]'
            : 'translate-x-[3px]'
      }`}
    />
  </button>
)
