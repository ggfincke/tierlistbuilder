// src/shared/ui/CopyButton.tsx
// secondary button w/ copied-state icon + label swap

import { Check, Copy } from 'lucide-react'

import { SecondaryButton } from '~/shared/ui/SecondaryButton'

interface CopyButtonProps
{
  copied: boolean
  onClick: () => void
  ariaLabel: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

export const CopyButton = ({
  copied,
  onClick,
  ariaLabel,
  disabled = false,
  size = 'md',
}: CopyButtonProps) => (
  <SecondaryButton
    size={size}
    variant="surface"
    disabled={disabled}
    onClick={onClick}
    aria-label={ariaLabel}
  >
    {copied ? (
      <Check className="h-3.5 w-3.5 text-[var(--t-accent)]" />
    ) : (
      <Copy className="h-3.5 w-3.5" />
    )}
    {copied ? 'Copied' : 'Copy'}
  </SecondaryButton>
)
