// src/features/marketplace/components/meta/MetaPill.tsx
// editorial eyebrow pill across marketplace surfaces — small mono uppercase
// label w/ optional icon; shape & tone vary the editorial register

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

type MetaPillTone = 'default' | 'accent'
type MetaPillShape = 'rounded' | 'pill'

interface MetaPillProps
{
  // pill body — typically a short label or count
  children: ReactNode
  // optional leading icon, sized 12px to match the editorial rhythm of the
  // surrounding chip group (rails, hero meta)
  icon?: LucideIcon
  // accent = mint border + accent text on a soft overlay (category eyebrow,
  // editor's pick). default = neutral border + secondary text (counts, status)
  tone?: MetaPillTone
  // rounded = rounded-md (chip group register, pairs w/ icons).
  // pill = rounded-full (standalone tag register, reads as a category badge)
  shape?: MetaPillShape
}

const TONE_CLASS: Record<MetaPillTone, string> = {
  default:
    'border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)]',
  accent:
    'border-[var(--t-accent)] bg-[rgb(var(--t-overlay)/0.06)] text-[var(--t-accent)]',
}

const SHAPE_CLASS: Record<MetaPillShape, string> = {
  rounded: 'rounded-md',
  pill: 'rounded-full',
}

export const MetaPill = ({
  children,
  icon: Icon,
  tone = 'default',
  shape = 'rounded',
}: MetaPillProps) => (
  <span
    className={joinClassNames(
      'inline-flex items-center gap-1 border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]',
      SHAPE_CLASS[shape],
      TONE_CLASS[tone]
    )}
  >
    {Icon && <Icon className="h-3 w-3" strokeWidth={1.8} aria-hidden />}
    {children}
  </span>
)
