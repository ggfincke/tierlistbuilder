// src/features/marketplace/pages/TemplateDetailPage.tsx
// breadcrumb -> hero -> consensus (w/ inline rail) -> credit -> related

import { Layers } from 'lucide-react'
import { useParams } from 'react-router-dom'

import {
  isTemplateSlug,
  type MarketplaceTemplateDetail,
} from '@tierlistbuilder/contracts/marketplace/template'
import { isTemplateRankingAggregateReady as isAggregateReady } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { useTemplateBySlug } from '~/features/marketplace/model/useTemplateDetail'
import { useRelatedTemplates } from '~/features/marketplace/model/useTemplateDetail'
import { useTemplateRankingAggregate } from '~/features/marketplace/model/useRankingDetail'
import { useRecordTemplateView } from '~/features/marketplace/model/useRecordTemplateView'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { SkeletonBlock, SkeletonCard, SkeletonText } from '~/shared/ui/Skeleton'

import { Card } from '~/features/marketplace/components/Card'
import { CommunityConsensusSection } from '~/features/marketplace/components/CommunityConsensusSection'
import { HeroRailCards } from '~/features/marketplace/components/consensus/HeroRailCards'
import { useHeroSpread } from '~/features/marketplace/components/consensus/useHeroSpread'
import { templateFrame } from '~/features/marketplace/components/consensus/utils'
import { RailHeader } from '~/features/marketplace/components/RailHeader'
import { RecommendedPresetCard } from '~/features/marketplace/components/RecommendedPresetCard'
import { TemplateHero } from '~/features/marketplace/components/TemplateHero'
import { MarketplaceNotFound } from '~/features/marketplace/components/MarketplaceNotFound'
import { MarketplaceBreadcrumb } from '~/features/marketplace/components/MarketplaceBreadcrumb'

const RELATED_LIMIT = 4

const NotFound = () => (
  <MarketplaceNotFound
    title="Template not found"
    body="It may have been unpublished or the link might be wrong."
    actionLabel="Back to gallery"
    to={TEMPLATES_ROUTE_PATH}
  />
)

const DetailSkeleton = () => (
  <section
    aria-hidden="true"
    className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24"
  >
    <SkeletonText className="w-48" tone="soft" />
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.25fr_0.95fr_320px]">
      <SkeletonBlock className="h-72 rounded-2xl sm:h-80 lg:h-[30rem]" />
      <div className="space-y-4">
        <SkeletonText className="w-32" tone="soft" />
        <SkeletonBlock className="h-9 w-3/4 rounded" tone="strong" />
        <SkeletonText className="w-2/3" tone="soft" />
        <SkeletonBlock className="h-11 rounded-md" />
      </div>
      <div className="hidden flex-col gap-3 lg:flex">
        <SkeletonBlock className="h-24 rounded-xl" tone="soft" />
        <SkeletonBlock className="h-36 rounded-xl" tone="soft" />
        <SkeletonBlock className="h-32 rounded-xl" tone="soft" />
      </div>
    </div>
    <SkeletonBlock className="mt-12 h-9 rounded-md" tone="soft" />
    <SkeletonBlock className="mt-3 h-64 rounded-xl" tone="soft" />
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
          <SkeletonCard key={index} />
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

interface CreditNoteProps
{
  template: MarketplaceTemplateDetail
}

const CreditNote = ({ template }: CreditNoteProps) =>
{
  const credit = template.creditLine
  if (!credit) return null
  return (
    <section className="mt-8">
      <p className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4 text-xs leading-relaxed text-[var(--t-text-muted)]">
        <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
          Credit
        </span>
        <span className="mt-1.5 block">{credit}</span>
      </p>
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
  useDocumentTitle(detail ? `${detail.title} · TierListBuilder` : null)

  const aggregate = useTemplateRankingAggregate(detail ? detail.slug : null)
  const spreadCounts = useHeroSpread({
    aggregate,
  })

  if (validSlug === null) return <NotFound />
  if (detail === undefined) return <DetailSkeleton />
  if (detail === null) return <NotFound />

  const categoryLabel = CATEGORY_META[detail.category].label
  const hasConsensus = isAggregateReady(aggregate)
  const rankingCount = aggregate?.rankingCount ?? 0
  const frame = templateFrame(detail)
  const hasPreset = detail.suggestedTiers.length > 0
  const showRail = hasPreset || (hasConsensus && aggregate !== null)

  return (
    <article className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pt-20 pb-20 sm:px-8 sm:pt-24">
      <MarketplaceBreadcrumb
        items={[
          { label: 'Templates', to: TEMPLATES_ROUTE_PATH },
          { label: categoryLabel },
          { label: detail.title },
        ]}
      />

      <div className="mt-5">
        <TemplateHero
          template={detail}
          hasConsensus={hasConsensus}
          rankingCount={rankingCount}
          spreadCounts={spreadCounts ?? undefined}
          rightRail={
            showRail ? (
              <>
                {hasPreset && (
                  <RecommendedPresetCard tiers={detail.suggestedTiers} />
                )}
                {hasConsensus && aggregate && (
                  <div
                    className={`flex flex-col gap-3 ${hasPreset ? 'lg:mt-auto' : ''}`}
                  >
                    <HeroRailCards
                      templateSlug={detail.slug}
                      aggregate={aggregate}
                      frame={frame}
                      labelSettings={detail.labels}
                    />
                  </div>
                )}
              </>
            ) : null
          }
        />
      </div>

      <section className="mt-12">
        <CommunityConsensusSection
          key={detail.slug}
          template={detail}
          aggregate={aggregate}
        />
      </section>

      <CreditNote template={detail} />

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
