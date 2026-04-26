// src/app/routes/MyListsRoute.tsx
// placeholder for /boards. full board-list UI lands in a follow-up

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Layers } from 'lucide-react'

import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'

export const MyListsRoute = () =>
{
  useEffect(() =>
  {
    const previous = document.title
    document.title = 'My lists · TierListBuilder'
    return () =>
    {
      document.title = previous
    }
  }, [])

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col items-start justify-center gap-8 px-6 pt-32 pb-24 sm:px-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-text-faint)]">
        My lists · coming soon
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-[var(--t-text)] sm:text-5xl">
        A home for every ranking you've made.
      </h1>
      <p className="max-w-xl text-sm text-[var(--t-text-muted)]">
        We're building a dedicated browser for your saved lists, drafts, &
        archived rankings. For now, your active boards live in the workspace
        board switcher.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="focus-custom inline-flex items-center gap-2 rounded-full bg-[var(--t-text)] px-4 py-2 text-sm font-semibold text-[var(--t-bg-page)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <Layers className="h-3.5 w-3.5" strokeWidth={2} />
          Open workspace
        </Link>
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
}
