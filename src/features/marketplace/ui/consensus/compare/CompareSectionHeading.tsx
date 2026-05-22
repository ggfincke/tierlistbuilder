// src/features/marketplace/ui/consensus/compare/CompareSectionHeading.tsx
// repeated heading block for compare-page sections

import type { ComponentProps, ReactNode } from 'react'

import { SectionEyebrow } from '~/features/marketplace/ui/consensus/SectionEyebrow'

interface CompareSectionHeadingProps
{
  eyebrow: string
  eyebrowTone?: ComponentProps<typeof SectionEyebrow>['tone']
  title: ReactNode
  body: ReactNode
}

export const CompareSectionHeading = ({
  eyebrow,
  eyebrowTone,
  title,
  body,
}: CompareSectionHeadingProps) => (
  <div className="mb-3">
    <SectionEyebrow tone={eyebrowTone}>{eyebrow}</SectionEyebrow>
    <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--t-text)]">
      {title}
    </h2>
    <p className="mt-1 text-xs text-[var(--t-text-muted)]">{body}</p>
  </div>
)
