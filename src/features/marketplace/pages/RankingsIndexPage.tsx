// src/features/marketplace/pages/RankingsIndexPage.tsx
// rankings index placeholder — keeps /rankings from rendering blank chrome

import { ArrowRight, ListChecks, Sparkles } from 'lucide-react'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { ButtonLink } from '~/shared/ui/Button'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { PAGE_SHELL } from '~/shared/ui/pageContainer'

export const RankingsIndexPage = () =>
{
  useDocumentTitle('Rankings · TierListBuilder')

  return (
    <section
      className={`${PAGE_SHELL} flex min-h-[70vh] items-center pt-20 pb-12 sm:pt-24`}
    >
      <div className="max-w-2xl">
        <DisplayHeadline
          eyebrow="Community rankings · Coming soon"
          primary="Ranking browse is still"
          accent="being assembled"
          subtitle="Public rankings already live on each template detail page. Start from a template to publish your own, or return to the workspace to keep building locally."
          size="display"
        />

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink to={TEMPLATES_ROUTE_PATH} variant="primary" size="md">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            Browse templates
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </ButtonLink>
          <ButtonLink to="/" surface="filled" size="md">
            <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
            Open workspace
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
