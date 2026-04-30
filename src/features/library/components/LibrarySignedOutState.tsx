// src/features/library/components/LibrarySignedOutState.tsx
// signed-out empty state for /boards — heading + sign-in CTA + templates link

import { ArrowRight, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'

export const LibrarySignedOutState = () => (
  <section className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col items-start justify-center gap-6 px-6 pt-32 pb-24 sm:px-10">
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
      Your library
    </p>
    <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-[var(--t-text)] sm:text-5xl">
      A home for every ranking you've made.
    </h1>
    <p className="max-w-xl text-sm text-[var(--t-text-muted)]">
      Sign in to see your drafts, in-progress rankings, and finished lists in
      one place — synced across devices and ready to publish whenever you are.
    </p>
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => promptSignIn()}
        className="focus-custom inline-flex items-center gap-2 rounded-full bg-[var(--t-text)] px-4 py-2 text-sm font-semibold text-[var(--t-bg-page)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
        Sign in to see your lists
      </button>
      <Link
        to={TEMPLATES_ROUTE_PATH}
        className="focus-custom inline-flex items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-2 text-sm font-medium text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        Browse templates
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </div>
  </section>
)
