// src/features/marketplace/pages/TemplateDetailPage.tsx
// detail page for a single template — cover, meta, items grid, & use CTA;
// items grid reuses ItemContent so previews match the workspace

import { ArrowLeft, Clock, Eye, Layers } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  MAX_TEMPLATE_COVER_ITEMS,
  isTemplateSlug,
  type MarketplaceTemplateDetail,
  type MarketplaceTemplateItem,
} from '@tierlistbuilder/contracts/marketplace/template'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { useTemplateBySlug } from '~/features/marketplace/model/useTemplateDetail'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import {
  formatCount,
  formatRelativeTime,
  formatTimeToRank,
} from '~/features/marketplace/model/formatters'
import { Cover } from '~/features/marketplace/components/Cover'
import { UseTemplateButton } from '~/features/marketplace/components/UseTemplateButton'
import {
  TEMPLATES_ROUTE_PATH,
  getTemplateDetailPath,
} from '~/app/routes/pathname'

const ITEM_SLOT_HEIGHT = 96

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
    className="relative z-10 mx-auto w-full max-w-[1240px] animate-pulse px-5 pt-10 sm:px-8"
  >
    <div className="h-72 rounded-2xl bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="mt-8 space-y-3">
      <div className="h-6 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
      <div className="h-3 w-1/3 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
      <div className="grid gap-3 pt-6 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-md bg-[rgb(var(--t-overlay)/0.06)]"
          />
        ))}
      </div>
    </div>
  </section>
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
        Suggested tiers
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
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

  // canonical href for share / og purposes — doesn't affect rendering
  const canonicalHref = useMemo(
    () => (validSlug ? getTemplateDetailPath(validSlug) : null),
    [validSlug]
  )

  if (validSlug === null) return <NotFound />
  if (detail === undefined) return <DetailSkeleton />
  if (detail === null) return <NotFound />

  const totalItems = detail.itemCount
  const detailCoverItems = detail.coverMedia
    ? []
    : detail.items
        .map((item) => item.media)
        .filter((media): media is NonNullable<typeof media> => media !== null)
        .slice(0, MAX_TEMPLATE_COVER_ITEMS)

  return (
    <article className="relative z-10 mx-auto w-full max-w-[1240px] px-5 pt-8 sm:px-8">
      <Link
        to={TEMPLATES_ROUTE_PATH}
        className="focus-custom inline-flex items-center gap-1.5 text-xs text-[var(--t-text-muted)] transition hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={2} />
        Back to templates
      </Link>

      <header className="relative mt-4 overflow-hidden rounded-2xl border border-[var(--t-border)]">
        <div className="relative h-72 sm:h-80">
          <Cover
            template={{ ...detail, coverItems: detailCoverItems }}
            density="hero"
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-5 sm:px-8">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[var(--t-text-secondary)]">
              {CATEGORY_META[detail.category].label}
            </span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--t-text)] sm:text-4xl">
              {detail.title}
            </h1>
            {detail.description && (
              <p className="mt-2 max-w-2xl text-sm text-[var(--t-text-muted)]">
                {detail.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--t-text-faint)]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--t-bg-active)] text-[10px] font-semibold text-[var(--t-text)]"
                >
                  {detail.author.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span>by {detail.author.displayName}</span>
              </span>
              <span>·</span>
              <span>updated {formatRelativeTime(detail.updatedAt)}</span>
              {canonicalHref && (
                <>
                  <span>·</span>
                  <span className="truncate">{canonicalHref}</span>
                </>
              )}
            </div>
          </div>
          <UseTemplateButton slug={detail.slug} templateTitle={detail.title} />
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--t-text-faint)]">
            <Layers className="h-3 w-3" strokeWidth={1.8} />
            Forks
          </span>
          <p className="mt-1 text-xl font-semibold text-[var(--t-text)]">
            {formatCount(detail.useCount)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--t-text-faint)]">
            <Eye className="h-3 w-3" strokeWidth={1.8} />
            Views
          </span>
          <p className="mt-1 text-xl font-semibold text-[var(--t-text)]">
            {formatCount(detail.viewCount)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--t-text-faint)]">
            <Clock className="h-3 w-3" strokeWidth={1.8} />
            Avg. time to rank
          </span>
          <p className="mt-1 text-xl font-semibold text-[var(--t-text)]">
            {formatTimeToRank(totalItems)}
          </p>
        </div>
      </div>

      {detail.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {detail.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-[rgb(var(--t-overlay)/0.06)] px-2 py-0.5 text-xs text-[var(--t-text-muted)]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <header className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--t-text)]">
                Items
              </h2>
              <p className="text-xs text-[var(--t-text-faint)]">
                {totalItems} {totalItems === 1 ? 'item' : 'items'} ready to be
                ranked.
              </p>
            </div>
          </header>
          <ItemsGrid items={detail.items} />
        </div>
        <aside className="space-y-4">
          <TiersPreview tiers={detail.suggestedTiers} />
          {detail.creditLine && (
            <p className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-3 text-xs text-[var(--t-text-muted)]">
              {detail.creditLine}
            </p>
          )}
        </aside>
      </section>
    </article>
  )
}
