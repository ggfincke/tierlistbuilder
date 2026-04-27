// src/features/marketplace/pages/TemplateDetailPage.tsx
// detail page — breadcrumb + hero (cover left / meta right), items grid,
// recommended tiers, & a related-templates rail under the same category

import { ArrowLeft, Clock, Eye, Layers, Sparkles } from 'lucide-react'
import { useEffect, type ComponentType, type SVGProps } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  isTemplateSlug,
  type MarketplaceTemplateDetail,
  type MarketplaceTemplateItem,
} from '@tierlistbuilder/contracts/marketplace/template'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import {
  useRelatedTemplates,
  useTemplateBySlug,
} from '~/features/marketplace/model/useTemplateDetail'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import {
  formatCount,
  formatRelativeTime,
  formatTimeToRank,
} from '~/features/marketplace/model/formatters'
import { Card } from '~/features/marketplace/components/Card'
import { Cover } from '~/features/marketplace/components/Cover'
import { RailHeader } from '~/features/marketplace/components/RailHeader'
import { ShareTemplateButton } from '~/features/marketplace/components/ShareTemplateButton'
import { UseTemplateButton } from '~/features/marketplace/components/UseTemplateButton'
import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'

const ITEM_SLOT_HEIGHT = 96
const RELATED_LIMIT = 4

const ItemThumbnail = ({ item }: { item: MarketplaceTemplateItem }) => (
  <div
    className="relative aspect-square w-full overflow-hidden rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
    style={{ minHeight: ITEM_SLOT_HEIGHT }}
  >
    <ItemContent
      item={{
        imageUrl: item.media?.url,
        label: item.label ?? undefined,
        backgroundColor: item.backgroundColor ?? undefined,
        altText: item.altText ?? undefined,
        aspectRatio: item.aspectRatio ?? undefined,
        transform: item.transform ?? undefined,
      }}
      fit={item.imageFit ?? 'cover'}
    />
  </div>
)

const ItemsGrid = ({
  items,
}: {
  items: readonly MarketplaceTemplateItem[]
}) =>
{
  if (items.length === 0)
  {
    return (
      <p className="rounded-md border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-4 py-6 text-center text-sm text-[var(--t-text-muted)]">
        This template doesn't have any items.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {items.map((item) => (
        <ItemThumbnail key={item.externalId} item={item} />
      ))}
    </div>
  )
}

interface StatTileProps
{
  label: string
  value: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const StatTile = ({ label, value, icon: Icon }: StatTileProps) => (
  <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-2.5">
    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
      <Icon className="h-3 w-3" strokeWidth={1.8} />
      {label}
    </span>
    <p className="mt-1 text-lg font-semibold text-[var(--t-text)]">{value}</p>
  </div>
)

const TiersPreview = ({
  tiers,
}: {
  tiers: MarketplaceTemplateDetail['suggestedTiers']
}) =>
{
  if (tiers.length === 0)
  {
    return null
  }
  return (
    <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4">
      <h3 className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
        Recommended tiers
      </h3>
      <p className="mt-1 text-xs text-[var(--t-text-muted)]">
        Suggested by the author. You can edit them after forking.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tiers.map((tier, i) => (
          <span
            key={`${tier.name}-${i}`}
            className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2.5 py-1 text-xs font-semibold text-[var(--t-text)]"
          >
            {tier.name}
          </span>
        ))}
      </div>
    </div>
  )
}

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
  <section className="relative z-10 mx-auto flex min-h-[60vh] w-full max-w-[1240px] items-center justify-center px-5 text-center sm:px-8">
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
    className="relative z-10 mx-auto w-full max-w-[1240px] animate-pulse px-5 pt-8 pb-20 sm:px-8 sm:pt-10"
  >
    <div className="h-3 w-48 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="h-72 rounded-2xl bg-[rgb(var(--t-overlay)/0.06)] sm:h-80 lg:h-[26rem]" />
      <div className="space-y-4">
        <div className="h-3 w-32 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="h-9 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
        <div className="h-3 w-2/3 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="h-16 rounded-lg bg-[rgb(var(--t-overlay)/0.05)]" />
          <div className="h-16 rounded-lg bg-[rgb(var(--t-overlay)/0.05)]" />
          <div className="h-16 rounded-lg bg-[rgb(var(--t-overlay)/0.05)]" />
        </div>
        <div className="h-10 rounded-md bg-[rgb(var(--t-overlay)/0.06)]" />
      </div>
    </div>
    <div className="mt-12 grid gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-md bg-[rgb(var(--t-overlay)/0.06)]"
        />
      ))}
    </div>
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
        {Array.from({ length: RELATED_LIMIT }).map((_, i) => (
          <RelatedSkeletonCard key={i} />
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

export const TemplateDetailPage = () =>
{
  const { slug } = useParams<{ slug: string }>()
  const validSlug = slug && isTemplateSlug(slug) ? slug : null
  const detail = useTemplateBySlug(validSlug)

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

  const totalItems = detail.itemCount
  const categoryLabel = CATEGORY_META[detail.category].label

  // mirror the summary projection so detail covers share the gallery renderer.
  // pass the full item set (Mosaic slices to its own slot count) — the stored
  // coverItems cap doesn't apply here because we have detail.items in hand
  const detailCoverItems = detail.coverMedia
    ? []
    : detail.items.flatMap((item) =>
        item.media ? [{ media: item.media, label: item.label }] : []
      )

  return (
    <article className="relative z-10 mx-auto w-full max-w-[1240px] px-5 pt-6 pb-20 sm:px-8 sm:pt-10">
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

      <header className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-stretch">
        <div className="relative h-72 overflow-hidden rounded-2xl border border-[var(--t-border)] sm:h-80 lg:h-[26rem]">
          <Cover
            template={{
              ...detail,
              coverItems: detailCoverItems,
            }}
            density="hero"
          />
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--t-text-secondary)]">
              {categoryLabel}
            </span>
            {detail.featuredRank !== null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--t-text-secondary)]">
                <Sparkles className="h-3 w-3" strokeWidth={1.8} />
                Editor's pick
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--t-text)] sm:text-4xl">
            {detail.title}
          </h1>

          {detail.description && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--t-text-muted)]">
              {detail.description}
            </p>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--t-bg-active)] text-sm font-semibold text-[var(--t-text)]"
            >
              {detail.author.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--t-text)]">
                {detail.author.displayName}
              </p>
              <p className="text-xs text-[var(--t-text-faint)]">
                Updated {formatRelativeTime(detail.updatedAt)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatTile
              label="Forks"
              value={formatCount(detail.useCount)}
              icon={Layers}
            />
            <StatTile
              label="Views"
              value={formatCount(detail.viewCount)}
              icon={Eye}
            />
            <StatTile
              label="Time"
              value={formatTimeToRank(totalItems)}
              icon={Clock}
            />
          </div>

          <div className="mt-5 flex items-stretch gap-2">
            <UseTemplateButton
              slug={detail.slug}
              templateTitle={detail.title}
              size="md"
              className="h-10 flex-1 px-4 text-sm"
            />
            <ShareTemplateButton
              slug={detail.slug}
              templateTitle={detail.title}
            />
          </div>

          {detail.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {detail.tags.map((t) => (
                <Link
                  key={t}
                  to={`${TEMPLATES_ROUTE_PATH}?tag=${encodeURIComponent(t)}`}
                  className="focus-custom rounded-md border border-[var(--t-border)] px-2 py-0.5 text-[11px] text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--t-text)]">
              Items in this template
            </h2>
            <p className="mt-0.5 text-xs text-[var(--t-text-muted)]">
              Unranked. You'll sort them into tiers when you fork.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </span>
        </div>
        <ItemsGrid items={detail.items} />
      </section>

      {(detail.suggestedTiers.length > 0 || detail.creditLine) && (
        <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <TiersPreview tiers={detail.suggestedTiers} />
          {detail.creditLine && (
            <p className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-4 text-xs leading-relaxed text-[var(--t-text-muted)]">
              <span className="block text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
                Credit
              </span>
              <span className="mt-1.5 block">{detail.creditLine}</span>
            </p>
          )}
        </section>
      )}

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
