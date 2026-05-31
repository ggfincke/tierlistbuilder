// src/features/marketplace/ui/consensus/rail/RankingAuthorSwatch.tsx
// colored ranking swatch w/ optional featured badge

import { Crown } from 'lucide-react'

import { avatarColor } from '../lib/utils'

interface RankingAuthorSwatchProps
{
  slug: string
  featured?: boolean
  size?: 'sm' | 'lg'
}

const SIZE_CLASS = {
  sm: 'h-7 w-7',
  lg: 'h-10 w-10',
} as const

export const RankingAuthorSwatch = ({
  slug,
  featured = false,
  size = 'sm',
}: RankingAuthorSwatchProps) => (
  <span
    aria-hidden="true"
    className={`relative flex shrink-0 items-center justify-center rounded-full text-black/70 ${SIZE_CLASS[size]}`}
    style={{ background: avatarColor(slug) }}
  >
    {size === 'lg' ? <Crown className="h-4 w-4" strokeWidth={2} /> : null}
    {featured && size === 'sm' ? (
      <span
        aria-hidden="true"
        className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--t-bg-surface)] text-[var(--t-warning,#facc15)] ring-1 ring-[var(--t-border)]"
        title="Featured ranking"
      >
        <Crown className="h-2 w-2" strokeWidth={2.2} />
      </span>
    ) : null}
  </span>
)
