// src/app/shells/topNav/BrandCapsule.tsx
// wordmark link for the global app chrome

import { Link } from 'react-router-dom'

export const BrandCapsule = () => (
  <Link
    to="/"
    aria-label="TierListBuilder home"
    className="focus-custom pointer-events-auto inline-flex items-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/85 px-4 py-1.5 text-[12px] font-semibold text-[var(--t-text)] backdrop-blur transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    TierListBuilder
  </Link>
)
