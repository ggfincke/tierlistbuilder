// src/features/workspace/imageEditor/ui/AutoCropButton.tsx
// shared auto-crop action button for toolbar & per-item editor controls

import { Check, Crop, Loader2 } from 'lucide-react'

export type AutoCropButtonState = 'idle' | 'running' | 'applied'
export type AutoCropButtonVariant = 'toolbar' | 'plain'

interface AutoCropButtonProps
{
  state: AutoCropButtonState
  variant: AutoCropButtonVariant
  labels: Record<AutoCropButtonState, string>
  minWidthClassName: string
  disabled: boolean
  onClick: () => void
  ariaLabels: Record<AutoCropButtonState, string>
  title?: string
}

export const AutoCropButton = ({
  state,
  variant,
  labels,
  minWidthClassName,
  disabled,
  onClick,
  ariaLabels,
  title,
}: AutoCropButtonProps) =>
{
  const variantClass =
    variant === 'toolbar'
      ? 'border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] enabled:hover:text-[var(--t-text)]'
      : state === 'applied'
        ? 'bg-[var(--t-bg-active)] text-[var(--t-text-muted)]'
        : 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`focus-custom inline-flex ${minWidthClassName} items-center justify-center gap-1 rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${variantClass}`}
      aria-label={ariaLabels[state]}
      title={title}
    >
      {state === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === 'applied' ? (
        <Check className="h-3 w-3" />
      ) : (
        <Crop className="h-3 w-3" />
      )}
      <span className={state === 'running' ? 'tabular-nums' : undefined}>
        {labels[state]}
      </span>
    </button>
  )
}
