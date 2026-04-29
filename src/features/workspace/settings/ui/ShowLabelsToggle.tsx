// src/features/workspace/settings/ui/ShowLabelsToggle.tsx
// board-level caption visibility toggle

import { useId } from 'react'

import { Toggle } from './Toggle'

interface ShowLabelsToggleProps
{
  checked: boolean
  onChange: (checked: boolean) => void
}

export const ShowLabelsToggle = ({
  checked,
  onChange,
}: ShowLabelsToggleProps) =>
{
  const labelId = useId()
  return (
    <div
      className="inline-flex items-center gap-2"
      title="Default caption visibility for items without a per-tile Show/Hide override. Per-item Show/Hide always wins."
    >
      <span id={labelId} className="text-xs text-[var(--t-text-muted)]">
        Show labels by default
      </span>
      <Toggle checked={checked} onChange={onChange} ariaLabelledby={labelId} />
    </div>
  )
}
