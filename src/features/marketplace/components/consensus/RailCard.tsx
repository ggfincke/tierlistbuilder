// src/features/marketplace/components/consensus/RailCard.tsx
// shared panel shell for hero-rail cards (recommended preset, divisive, consensus)

import type { ReactNode } from 'react'

interface RailCardProps
{
  eyebrow: ReactNode
  meta?: ReactNode
  children: ReactNode
}

export const RailCard = ({ eyebrow, meta, children }: RailCardProps) => (
  <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
        {eyebrow}
      </p>
      {meta && (
        <span className="font-mono text-[10px] text-[var(--t-text-faint)]">
          {meta}
        </span>
      )}
    </div>
    <div className="mt-2.5">{children}</div>
  </div>
)
