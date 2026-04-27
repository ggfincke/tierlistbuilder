// src/features/marketplace/pages/TemplatesGalleryPage.tsx
// gallery landing — eyebrow + heading + search, jump-back-in row, hero +
// sidebar feature, rails, & a filterable browse grid

import {
  Flame,
  ListChecks,
  ListFilter,
  Sparkles,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  TEMPLATE_LIST_SORTS,
  type TemplateCategory,
  type TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'

import {
  Card,
  type CardFeaturedLabel,
} from '~/features/marketplace/components/Card'
import { CategoryChips } from '~/features/marketplace/components/CategoryChips'
import { CreateTile } from '~/features/marketplace/components/CreateTile'
import { DraftRail } from '~/features/marketplace/components/DraftRail'
import { Hero } from '~/features/marketplace/components/Hero'
import { PublishModal } from '~/features/marketplace/components/PublishModal'
import { Rail } from '~/features/marketplace/components/Rail'
import { RailHeader } from '~/features/marketplace/components/RailHeader'
import { SearchInput } from '~/features/marketplace/components/SearchInput'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { promptSignIn } from '~/features/marketplace/model/useSignInPromptStore'
import { useGalleryFilters } from '~/features/marketplace/model/useGalleryFilters'
import { useOpenTemplateDraft } from '~/features/marketplace/model/useOpenTemplateDraft'
import { useTemplatesGallery } from '~/features/marketplace/model/useTemplatesGallery'
import { formatCount } from '~/features/marketplace/model/formatters'

const SORT_LABELS: Record<TemplateListSort, string> = {
  featured: 'Featured',
  popular: 'Most popular',
  recent: 'Recently added',
}

const HERO_SECONDARY_LABELS = [
  'trending',
  'curated',
] as const satisfies readonly CardFeaturedLabel[]

const GridSkeleton = () => (
  <>
    {Array.from({ length: 7 }).map((_, i) => (
      <div
        key={i}
        aria-hidden="true"
        className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
      >
        <div className="h-40 bg-[rgb(var(--t-overlay)/0.06)]" />
        <div className="space-y-2 px-3 py-3">
          <div className="h-3 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
          <div className="h-2 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        </div>
      </div>
    ))}
  </>
)

export const TemplatesGalleryPage = () =>
{
  const session = useAuthSession()
  const filters = useGalleryFilters()
  const isSignedIn = session.status === 'signed-in'
  const gallery = useTemplatesGallery(filters, isSignedIn)
  const draftAction = useOpenTemplateDraft()
  const [publishOpen, setPublishOpen] = useState(false)

  // keep the document title meaningful for the gallery so deep links / share
  // previews carry the marketplace context
  useEffect(() =>
  {
    const previous = document.title
    document.title = 'Templates · TierListBuilder'
    return () =>
    {
      document.title = previous
    }
  }, [])

  const heroFeatured = gallery.featured?.[0] ?? null
  const heroSecondary = HERO_SECONDARY_LABELS.flatMap((label, index) =>
  {
    const template = gallery.featured?.[index + 1]
    return template ? [{ template, label }] : []
  })

  const showRails =
    !filters.searchDebounced &&
    filters.category === null &&
    filters.tag === null
  const showJumpBackRail =
    showRails &&
    isSignedIn &&
    (gallery.drafts === undefined || gallery.drafts.length > 0)
  const browseHeading = filters.tag
    ? `Tagged "${filters.tag}"${
        filters.category ? ` · ${CATEGORY_META[filters.category].label}` : ''
      }`
    : filters.category
      ? CATEGORY_META[filters.category].label
      : filters.searchDebounced
        ? `Results for "${filters.searchDebounced}"`
        : 'Browse everything'
  const templateCountLabel =
    gallery.templateCount === undefined
      ? 'Templates marketplace'
      : `Templates · ${
          gallery.templateCount.isCapped
            ? `${formatCount(gallery.templateCount.count)}+`
            : formatCount(gallery.templateCount.count)
        } available`

  const handleCreateTileClick = () =>
  {
    if (!isSignedIn)
    {
      promptSignIn()
      return
    }
    setPublishOpen(true)
  }

  // anchor the browse section's window position across category/tag toggles
  // so showing/hiding the upper rails doesn't shift the visible content
  const browseSectionRef = useRef<HTMLElement | null>(null)
  const pendingBrowseTopRef = useRef<number | null>(null)
  const captureBrowseAnchor = () =>
  {
    if (browseSectionRef.current)
    {
      pendingBrowseTopRef.current =
        browseSectionRef.current.getBoundingClientRect().top
    }
  }
  useLayoutEffect(() =>
  {
    if (pendingBrowseTopRef.current === null) return
    if (!browseSectionRef.current) return
    const newTop = browseSectionRef.current.getBoundingClientRect().top
    const delta = newTop - pendingBrowseTopRef.current
    pendingBrowseTopRef.current = null
    if (delta !== 0)
    {
      window.scrollBy(0, delta)
    }
  }, [filters.category, filters.tag])

  const handleCategoryChange = (next: TemplateCategory | null) =>
  {
    captureBrowseAnchor()
    filters.setCategory(next)
  }
  const handleTagClear = () =>
  {
    captureBrowseAnchor()
    filters.setTag(null)
  }

  const greeting = useMemo(() =>
  {
    if (session.status === 'signed-in')
    {
      const name =
        session.user.displayName ??
        session.user.name ??
        session.user.email?.split('@')[0]
      return name ? `Welcome back, ${name}.` : 'Welcome back.'
    }
    return 'Browse community templates.'
  }, [session])

  return (
    <>
      <section className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pt-20 sm:px-10 sm:pt-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-text-faint)]">
              {templateCountLabel}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--t-text)] sm:text-5xl">
              {greeting}
            </h1>
            <p className="mt-3 max-w-xl text-[14px] text-[var(--t-text-muted)]">
              {isSignedIn
                ? 'Pick up a draft, or fork a community template into a new ranking.'
                : 'Pre-built item sets you can fork into a new ranking with one click.'}
            </p>
          </div>
          <div className="lg:pb-2">
            <SearchInput
              value={filters.searchInput}
              onChange={filters.setSearch}
            />
          </div>
        </div>
      </section>

      {showJumpBackRail && (
        <section className="relative z-10 mx-auto mt-8 w-full max-w-[1200px] px-6 sm:px-10">
          <RailHeader
            title="Jump back in"
            subtitle="In-progress rankings from templates"
            icon={ListChecks}
          />
          <DraftRail
            drafts={gallery.drafts}
            pendingBoardExternalId={draftAction.pendingBoardExternalId}
            onOpen={(draft) => void draftAction.open(draft)}
          />
        </section>
      )}

      {showRails && heroFeatured && (
        <section className="relative z-10 mx-auto mt-8 w-full max-w-[1200px] px-6 sm:px-10">
          {heroSecondary.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Hero template={heroFeatured} />
              </div>
              <div className="grid grid-rows-2 gap-5">
                {heroSecondary.map(({ template, label }) => (
                  <Card
                    key={template.slug}
                    template={template}
                    size="default"
                    featuredLabel={label}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Hero template={heroFeatured} />
          )}
        </section>
      )}

      {showRails && (
        <>
          <section className="relative z-10 mx-auto mt-10 w-full max-w-[1200px] px-6 sm:px-10">
            <RailHeader
              title="Most popular"
              subtitle="All-time forks"
              icon={TrendingUp}
            />
            <Rail items={gallery.popular} size="small" />
          </section>

          <section className="relative z-10 mx-auto mt-10 w-full max-w-[1200px] px-6 sm:px-10">
            <RailHeader
              title="New & recently updated"
              subtitle="Fresh from creators"
              icon={Sparkles}
            />
            <Rail items={gallery.recent} size="small" />
          </section>
        </>
      )}

      <section
        ref={browseSectionRef}
        className="relative z-10 mx-auto mt-12 w-full max-w-[1200px] border-t border-[var(--t-border)] px-6 pt-10 sm:px-10"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--t-text)]">
              {browseHeading}
            </h2>
            <p className="mt-1 text-xs text-[var(--t-text-muted)]">
              {gallery.results
                ? `${gallery.results.length} ${gallery.results.length === 1 ? 'template' : 'templates'}`
                : 'Loading…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filters.tag && (
              <button
                type="button"
                onClick={handleTagClear}
                aria-label={`Remove tag filter "${filters.tag}"`}
                className="focus-custom inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              >
                <Tag className="h-3 w-3" strokeWidth={1.8} />
                <span className="font-medium text-[var(--t-text)]">
                  #{filters.tag}
                </span>
                <X
                  className="h-3 w-3 text-[var(--t-text-faint)]"
                  strokeWidth={1.8}
                />
              </button>
            )}
            <label
              className={`flex items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs text-[var(--t-text-secondary)] ${
                filters.tag ? 'opacity-50' : ''
              }`}
              title={
                filters.tag
                  ? 'Sort is fixed to recent while a tag filter is active'
                  : undefined
              }
            >
              <ListFilter className="h-3 w-3" strokeWidth={1.8} />
              <span className="sr-only">Sort templates by</span>
              <select
                value={filters.sort}
                onChange={(e) =>
                  filters.setSort(e.target.value as TemplateListSort)
                }
                disabled={filters.tag !== null}
                className="focus-custom bg-transparent text-xs font-medium text-[var(--t-text)] outline-none disabled:cursor-not-allowed"
              >
                {TEMPLATE_LIST_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {filters.searchDebounced && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-3 py-1.5 text-xs text-[var(--t-text-secondary)]">
                <Flame className="h-3 w-3" strokeWidth={1.8} />
                Search
              </span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <CategoryChips
            active={filters.category}
            onChange={handleCategoryChange}
            counts={gallery.templateCount?.countByCategory}
            totalCount={gallery.templateCount?.count}
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {!filters.searchDebounced && (
            <CreateTile onClick={handleCreateTileClick} size="default" />
          )}
          {gallery.results ? (
            gallery.results.map((template) => (
              <Card key={template.slug} template={template} size="default" />
            ))
          ) : (
            <GridSkeleton />
          )}
        </div>

        {gallery.results && gallery.results.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-6 py-10 text-center">
            <p className="text-sm font-medium text-[var(--t-text)]">
              No templates match your filters.
            </p>
            <p className="mt-1 text-xs text-[var(--t-text-muted)]">
              Try clearing the search or picking a different category.
            </p>
          </div>
        )}
      </section>

      <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} />
    </>
  )
}
