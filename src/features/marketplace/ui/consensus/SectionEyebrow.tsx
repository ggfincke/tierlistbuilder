// src/features/marketplace/ui/consensus/SectionEyebrow.tsx
// shared eyebrow typography for marketplace consensus surfaces

import type { CSSProperties, ElementType, ReactNode } from 'react'

const SECTION_EYEBROW_BASE_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-[0.18em]'

type SectionEyebrowTone = 'faint' | 'warning' | 'none'

const SECTION_EYEBROW_TONE_CLASS: Record<
  Exclude<SectionEyebrowTone, 'none'>,
  string
> = {
  faint: 'text-[var(--t-text-faint)]',
  warning: 'text-[var(--t-warning,#facc15)]',
}

interface SectionEyebrowProps
{
  as?: ElementType
  tone?: SectionEyebrowTone
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export const SectionEyebrow = ({
  as: Component = 'p',
  tone = 'faint',
  className = '',
  style,
  children,
}: SectionEyebrowProps) => (
  <Component
    className={`${SECTION_EYEBROW_BASE_CLASS} ${
      tone === 'none' ? '' : SECTION_EYEBROW_TONE_CLASS[tone]
    } ${className}`}
    style={style}
  >
    {children}
  </Component>
)
