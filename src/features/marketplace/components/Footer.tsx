// src/features/marketplace/components/Footer.tsx
// quiet marketplace footer — wordmark on the left, attribution on the right;
// rule line above keeps it visually anchored to the page

import { Link } from 'react-router-dom'

export const Footer = () => (
  <footer className="mt-24 border-t border-[var(--t-border)]">
    <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-[11px] text-[var(--t-text-faint)] sm:px-10">
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
