// src/features/workspace/imageEditor/ui/SaveStatusIndicator.tsx
// passive auto-save status indicator for the active image-editor pane

import { Check } from 'lucide-react'

interface SaveStatusIndicatorProps
{
  dirty: boolean
  savedFlash: boolean
}

export const SaveStatusIndicator = ({
  dirty,
  savedFlash,
}: SaveStatusIndicatorProps) =>
{
  if (dirty)
  {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] text-[var(--t-text-faint)]"
        role="status"
        aria-live="polite"
        title="Edits are saved automatically a moment after you stop changing things"
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-[var(--t-accent)] motion-safe:animate-pulse"
        />
        Editing...
      </span>
    )
  }
  if (savedFlash)
  {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] text-[var(--t-text-faint)]"
        role="status"
        aria-live="polite"
      >
        <Check aria-hidden="true" className="h-2.5 w-2.5 text-emerald-400" />
        Saved
      </span>
    )
  }
  return null
}
