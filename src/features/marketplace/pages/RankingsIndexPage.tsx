// src/features/marketplace/pages/RankingsIndexPage.tsx
// rankings index placeholder — keeps /rankings from rendering blank chrome

import { ArrowRight, ListChecks, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'

export const RankingsIndexPage = () =>
{
  useDocumentTitle('Rankings · TierListBuilder')

  return (
    <section className="relative z-10 mx-auto flex min-h-[70vh] w-full max-w-[1200px] items-center px-6 pt-20 pb-12 sm:px-10 sm:pt-24">
      <div className="max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-text-faint)]">
          Community rankings
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--t-text)] sm:text-5xl">
          Ranking browse is still being assembled.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--t-text-muted)]">
          Public rankings already live on each template detail page. Start from
          a template to publish your own, or return to the workspace to keep
          building locally.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to={TEMPLATES_ROUTE_PATH}
            className="focus-custom inline-flex items-center gap-2 rounded-md bg-[var(--t-accent)] px-4 py-2 text-sm font-semibold text-[var(--t-accent-foreground)] shadow-[2px_2px_0_var(--t-accent-2)] transition-[transform,box-shadow] duration-100 hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_var(--t-accent-2)] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_var(--t-accent-2)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            Browse templates
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
          <Link
            to="/"
            className="focus-custom inline-flex items-center gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
            Open workspace
          </Link>
        </div>
      </div>
    </section>
  )
}
