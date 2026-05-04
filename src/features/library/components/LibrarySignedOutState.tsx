// src/features/library/components/LibrarySignedOutState.tsx
// signed-out /boards state w/ auth & template entry CTAs

import { LogIn, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

export const LibrarySignedOutState = () => (
  <section className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col items-start justify-center gap-6 px-6 pt-32 pb-24 sm:px-10">
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
      Your library
    </p>
    <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-[var(--t-text)] sm:text-5xl">
      A home for every ranking you've made.
    </h1>
    <p className="max-w-xl text-sm text-[var(--t-text-muted)]">
      Drafts, in-progress rankings, and finished lists sync to your account once
      you sign in.
    </p>
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={promptSignIn}
        className="focus-custom inline-flex items-center gap-2 rounded-full bg-[var(--t-text)] px-4 py-2 text-sm font-semibold text-[var(--t-bg-page)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
        Sign in to see your lists
      </button>
      <Link
        to={TEMPLATES_ROUTE_PATH}
        className="focus-custom inline-flex items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
        Browse templates
      </Link>
    </div>
  </section>
)
