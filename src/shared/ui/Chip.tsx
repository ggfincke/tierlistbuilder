// src/shared/ui/Chip.tsx
// filter/status chip — default outlined ghost; active fills w/ --t-accent &
// casts the chunky 2px 2px 0 --t-accent-2 shadow. Composes into rails.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import {
  BUTTON_DISABLED_CLASS,
  BUTTON_FOCUS_CLASS,
} from '~/shared/ui/buttonBase'
import { CHUNKY_SHADOW_ACCENT } from '~/shared/ui/chunkyShadow'

interface ChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'children'
>
{
  // visible chip text — keep short (≤ 12 chars typical)
  label: ReactNode
  // tiny secondary number (e.g. count of matching items). Rendered w/ reduced
  // opacity so the label keeps optical weight.
  count?: ReactNode
  // optional leading icon, sized 12px to match the design's editorial rhythm
  icon?: ReactNode
  active?: boolean
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
}

const CHIP_BASE =
  'focus-custom inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium tracking-[-0.005em] transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

const CHIP_DEFAULT =
  'border-[var(--t-border)] bg-transparent text-[var(--t-text-muted)] hover:border-[var(--t-border-secondary)] hover:text-[var(--t-text)]'

// active chip carries the chunky-shadow primary CTA signature so the selected
// filter reads in the same visual register as the +New CTA. CHIP_BASE already
// declares `transition`, so we don't import CHUNKY_SHADOW_TRANSITION here
const CHIP_ACTIVE = `border-[var(--t-accent)] bg-[var(--t-accent)] font-semibold text-[var(--t-accent-foreground)] ${CHUNKY_SHADOW_ACCENT}`

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  (
    { className, label, count, icon, active = false, type = 'button', ...rest },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      {...rest}
      className={joinClassNames(
        CHIP_BASE,
        BUTTON_FOCUS_CLASS,
        BUTTON_DISABLED_CLASS,
        active ? CHIP_ACTIVE : CHIP_DEFAULT,
        className
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="inline-flex h-3 w-3 items-center justify-center"
        >
          {icon}
        </span>
      )}
      <span>{label}</span>
      {count != null && (
        <span
          aria-hidden
          className="font-mono text-[10px] tracking-normal opacity-70"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          {count}
        </span>
      )}
    </button>
  )
)

Chip.displayName = 'Chip'
