// src/features/marketplace/pages/TemplateDetailPage.tsx
// breadcrumb -> hero -> consensus (w/ inline rail) -> credit -> related

import { ArrowLeft, Layers } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  isTemplateSlug,
  type MarketplaceTemplateDetail,
} from '@tierlistbuilder/contracts/marketplace/template'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { useTemplateBySlug } from '~/features/marketplace/model/useTemplateDetail'
import { useRelatedTemplates } from '~/features/marketplace/model/useTemplateDetail'
import { useTemplateRankingAggregate } from '~/features/marketplace/model/useRankingDetail'
import { useRecordTemplateView } from '~/features/marketplace/model/useRecordTemplateView'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

import { Card } from '~/features/marketplace/components/Card'
import { CommunityConsensusSection } from '~/features/marketplace/components/CommunityConsensusSection'
import { HeroRailCards } from '~/features/marketplace/components/consensus/HeroRailCards'
import { useHeroSpread } from '~/features/marketplace/components/consensus/useHeroSpread'
import {
  isAggregateReady,
  templateFrame,
} from '~/features/marketplace/components/consensus/utils'
import { RailHeader } from '~/features/marketplace/components/RailHeader'
import { TemplateHero } from '~/features/marketplace/components/TemplateHero'

const RELATED_LIMIT = 4

const RelatedSkeletonCard = () => (
  <div
    aria-hidden="true"
    className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
  >
    <div className="h-40 bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="space-y-2 px-3 py-3">
      <div className="h-3 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
      <div className="h-2 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    </div>
  </div>
)

const NotFound = () => (
  <section className="relative z-10 mx-auto flex min-h-[60vh] w-full max-w-[1320px] items-center justify-center px-5 pt-20 text-center sm:px-8 sm:pt-24">
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold text-[var(--t-text)]">
        Template not found
      </h1>
      <p className="mt-2 text-sm text-[var(--t-text-muted)]">
        It may have been unpublished or the link might be wrong.
      </p>
      <Link
        to={TEMPLATES_ROUTE_PATH}
        className="focus-custom mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--t-accent)] px-4 py-2 text-sm font-semibold text-[var(--t-accent-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        Back to gallery
      </Link>
    </div>
  </section>
)

const DetailSkeleton = () => (
  <section
    aria-hidden="true"
    className="relative z-10 mx-auto w-full max-w-[1320px] animate-pulse px-5 pt-20 pb-20 sm:px-8 sm:pt-24"
  >
    <div className="h-3 w-48 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.25fr_0.95fr_320px]">
      <div className="h-72 rounded-2xl bg-[rgb(var(--t-overlay)/0.06)] sm:h-80 lg:h-[26rem]" />
      <div className="space-y-4">
        <div className="h-3 w-32 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="h-9 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
        <div className="h-3 w-2/3 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="h-11 rounded-md bg-[rgb(var(--t-overlay)/0.06)]" />
      </div>
      <div className="hidden flex-col gap-3 lg:flex">
        <div className="h-32 rounded-xl bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="h-32 rounded-xl bg-[rgb(var(--t-overlay)/0.05)]" />
      </div>
    </div>
    <div className="mt-12 h-9 rounded-md bg-[rgb(var(--t-overlay)/0.05)]" />
    <div className="mt-3 h-64 rounded-xl bg-[rgb(var(--t-overlay)/0.04)]" />
  </section>
)

const RelatedTemplatesRail = ({
  slug,
  categoryLabel,
}: {
  slug: string
  categoryLabel: string
}) =>
{
  const result = useRelatedTemplates({ slug, limit: RELATED_LIMIT })
  if (result === undefined)
  {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: RELATED_LIMIT }).map((_, index) => (
          <RelatedSkeletonCard key={index} />
        ))}
      </div>
    )
  }
  if (result.items.length === 0)
  {
    return (
      <p className="rounded-md border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-4 py-6 text-center text-sm text-[var(--t-text-muted)]">
        Nothing else in {categoryLabel} yet — check back as the gallery grows.
      </p>
    )
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {result.items.map((tpl) => (
        <Card key={tpl.slug} template={tpl} size="default" />
      ))}
    </div>
  )
}

interface CreditAndTiersProps
{
  template: MarketplaceTemplateDetail
}

const CreditAndTiers = ({ template }: CreditAndTiersProps) =>
{
  const tiers = template.suggestedTiers
  const credit = template.creditLine
  if (tiers.length === 0 && !credit) return null
  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
      {tiers.length > 0 ? (
        <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            Recommended tiers
          </h3>
          <p className="mt-1 text-xs text-[var(--t-text-muted)]">
            Suggested by the author. You can edit them after forking.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tiers.map((tier, index) => (
              <span
                key={`${tier.name}-${index}`}
                className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2.5 py-1 text-xs font-semibold text-[var(--t-text)]"
              >
                {tier.name}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <span aria-hidden="true" />
      )}
      {credit && (
        <p className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4 text-xs leading-relaxed text-[var(--t-text-muted)]">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            Credit
          </span>
          <span className="mt-1.5 block">{credit}</span>
        </p>
      )}
    </section>
  )
}

export const TemplateDetailPage = () =>
{
  const { slug } = useParams<{ slug: string }>()
  const validSlug = slug && isTemplateSlug(slug) ? slug : null
  const detail = useTemplateBySlug(validSlug)
  // only record once we have a valid published row; null/undefined skip
  useRecordTemplateView(detail ? detail.slug : null)

  const aggregate = useTemplateRankingAggregate(detail ? detail.slug : null)
  const spreadCounts = useHeroSpread({
    aggregate,
  })

  useEffect(() =>
  {
    if (!detail) return
    const previous = document.title
    document.title = `${detail.title} · TierListBuilder`
    return () =>
    {
      document.title = previous
    }
  }, [detail])

  if (validSlug === null) return <NotFound />
  if (detail === undefined) return <DetailSkeleton />
  if (detail === null) return <NotFound />

  const categoryLabel = CATEGORY_META[detail.category].label
  const hasConsensus = isAggregateReady(aggregate)
  const rankingCount = aggregate?.rankingCount ?? 0
  const frame = templateFrame(detail)

  return (
    <article className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-[var(--t-text-muted)]"
      >
        <Link
          to={TEMPLATES_ROUTE_PATH}
          className="focus-custom rounded transition hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          Templates
        </Link>
        <span aria-hidden="true" className="opacity-40">
          /
        </span>
        <span>{categoryLabel}</span>
        <span aria-hidden="true" className="opacity-40">
          /
        </span>
        <span className="truncate text-[var(--t-text-secondary)]">
          {detail.title}
        </span>
      </nav>

      <div className="mt-5">
        <TemplateHero
          template={detail}
          hasConsensus={hasConsensus}
          rankingCount={rankingCount}
          spreadCounts={spreadCounts ?? undefined}
          rightRail={
            hasConsensus && aggregate ? (
              <HeroRailCards
                templateSlug={detail.slug}
                aggregate={aggregate}
                frame={frame}
                labelSettings={detail.labels}
              />
            ) : null
          }
        />
      </div>

      <section className="mt-12">
        <CommunityConsensusSection template={detail} aggregate={aggregate} />
      </section>

      <CreditAndTiers template={detail} />

      <section className="mt-12">
        <RailHeader
          title="Related templates"
          subtitle={`More from ${categoryLabel}`}
          icon={Layers}
        />
        <RelatedTemplatesRail
          slug={detail.slug}
          categoryLabel={categoryLabel}
        />
      </section>
    </article>
  )
}
