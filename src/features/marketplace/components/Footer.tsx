// src/features/marketplace/components/Footer.tsx
// minimal marketplace footer — sits at the bottom of the layout under the
// outlet so every templates page has matching chrome

import { Link } from 'react-router-dom'

export const Footer = () => (
  <footer className="mx-auto mt-12 w-full max-w-[1240px] border-t border-[var(--t-border)] px-5 pb-12 pt-8 sm:px-8">
    <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--t-text-faint)]">
      <Link
        to="/"
        className="focus-custom font-semibold tracking-tight text-[var(--t-text)] hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        TierListBuilder
      </Link>
      <span className="text-[var(--t-text-dim)]">
        Templates by the community
      </span>
    </div>
  </footer>
)
