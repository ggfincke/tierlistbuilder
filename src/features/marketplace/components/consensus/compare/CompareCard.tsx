// src/features/marketplace/components/consensus/compare/CompareCard.tsx
// shared chrome for compare-surface insight & narrative cards

import type { ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

interface CompareCardProps
{
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md'
}

const COMPARE_CARD_PADDING: Record<
  NonNullable<CompareCardProps['padding']>,
  string
> = {
  sm: 'p-3',
  md: 'p-4',
}

export const COMPARE_EYEBROW_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-faint)]'

export const CompareCard = ({
  children,
  className,
  padding = 'md',
}: CompareCardProps) => (
  <div
    className={joinClassNames(
      'rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] transition-colors hover:border-[var(--t-border-hover)]',
      COMPARE_CARD_PADDING[padding],
      className
    )}
  >
    {children}
  </div>
)
