// src/app/shells/topNav/BrandPill.tsx
// Scoreboard brand wordmark — "tier/list." w/ slash & trailing period in --t-accent

import { Link } from 'react-router-dom'

export const BrandPill = () => (
  <Link
    to="/"
    aria-label="TierListBuilder home"
    className="focus-custom pointer-events-auto inline-flex items-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/85 px-4 py-1.5 text-[13px] font-bold tracking-[-0.015em] text-[var(--t-text)] backdrop-blur transition hover:border-[var(--t-border-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    <span>tier</span>
    <span aria-hidden className="mx-px text-[var(--t-accent)]">
      /
    </span>
    <span>list</span>
    <span aria-hidden className="ml-px text-[var(--t-accent)]">
      .
    </span>
  </Link>
)
