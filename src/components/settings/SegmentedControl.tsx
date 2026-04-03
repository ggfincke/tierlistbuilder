// src/components/settings/SegmentedControl.tsx
// reusable segmented control for selecting between discrete options

interface SegmentedControlProps<T extends string>
{
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) => (
  <div className="flex rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)]">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
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
