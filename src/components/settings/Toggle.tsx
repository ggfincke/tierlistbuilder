// src/components/settings/Toggle.tsx
// reusable toggle switch component

interface ToggleProps
{
  checked: boolean
  onChange: (v: boolean) => void
}

export const Toggle = ({ checked, onChange }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
      checked ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-border-secondary)]'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
)
