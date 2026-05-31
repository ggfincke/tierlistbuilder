// src/features/marketplace/ui/layout/Footer.tsx
// quiet marketplace footer — wordmark on the left, attribution on the right;
// rule line above keeps it visually anchored to the page

import { Link } from 'react-router-dom'

import { PAGE_COLUMN } from '~/shared/ui/pageContainer'

export const Footer = () => (
  <footer className="mt-24 border-t border-[var(--t-border)]">
    <div
      className={`${PAGE_COLUMN} flex flex-wrap items-center justify-between gap-3 py-8 text-[11px] text-[var(--t-text-faint)]`}
    >
      <Link
        to="/"
        className="focus-custom font-semibold tracking-tight text-[var(--t-text)] transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        TierListBuilder
      </Link>
      <span className="uppercase tracking-[0.2em]">
        A community of rankings
      </span>
    </div>
  </footer>
)
