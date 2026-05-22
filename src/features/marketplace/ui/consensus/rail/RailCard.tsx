// src/features/marketplace/ui/consensus/rail/RailCard.tsx
// shared panel shell for hero-rail cards (recommended preset, divisive, consensus)

import type { ReactNode } from 'react'

import { SectionEyebrow } from '~/features/marketplace/ui/consensus/SectionEyebrow'

interface RailCardProps
{
  eyebrow: ReactNode
  meta?: ReactNode
  children: ReactNode
}

export const RailCard = ({ eyebrow, meta, children }: RailCardProps) => (
  <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3">
    <div className="flex items-center justify-between gap-2">
      <SectionEyebrow className="flex items-center gap-1.5">
        {eyebrow}
      </SectionEyebrow>
      {meta && (
        <span className="font-mono text-[10px] text-[var(--t-text-faint)]">
          {meta}
        </span>
      )}
    </div>
    <div className="mt-2.5">{children}</div>
  </div>
)
