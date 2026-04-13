// src/features/workspace/settings/ui/Toggle.tsx
// reusable toggle switch component

interface ToggleProps
{
  checked: boolean
  onChange: (v: boolean) => void
  ariaLabelledby?: string
  ariaDescribedby?: string
}

export const Toggle = ({
  checked,
  onChange,
  ariaLabelledby,
  ariaDescribedby,
}: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={ariaLabelledby}
    aria-describedby={ariaDescribedby}
    onClick={() => onChange(!checked)}
    className={`focus-custom relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--t-bg-sunken)] max-sm:h-6 max-sm:w-11 ${
      checked ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-secondary)]'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform max-sm:h-4 max-sm:w-4 ${
        checked
          ? 'translate-x-[18px] max-sm:translate-x-[22px]'
          : 'translate-x-[3px]'
      }`}
    />
  </button>
)
