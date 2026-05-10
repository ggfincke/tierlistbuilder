// src/features/marketplace/components/consensus/compare/CompareCard.tsx
// shared chrome for compare-surface insight & narrative cards

import type { ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

interface CompareCardProps
{
  children: ReactNode
  className?: string
}

export const CompareCard = ({ children, className }: CompareCardProps) => (
  <div
    className={joinClassNames(
      'rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4 transition-colors hover:border-[var(--t-border-hover)]',
      className
    )}
  >
    {children}
  </div>
)
