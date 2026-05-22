// src/features/marketplace/ui/consensus/compare/CompareSectionHeading.tsx
// repeated heading block for compare-page sections

import type { ReactNode } from 'react'

import { SectionEyebrow } from '~/features/marketplace/ui/consensus/SectionEyebrow'

interface CompareSectionHeadingProps
{
  eyebrow: string
  title: ReactNode
  body: ReactNode
}

export const CompareSectionHeading = ({
  eyebrow,
  title,
  body,
}: CompareSectionHeadingProps) => (
  <div className="mb-3">
    <SectionEyebrow>{eyebrow}</SectionEyebrow>
    <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--t-text)]">
      {title}
    </h2>
    <p className="mt-1 text-xs text-[var(--t-text-muted)]">{body}</p>
  </div>
)
