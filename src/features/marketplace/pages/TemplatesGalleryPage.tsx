// src/features/marketplace/pages/TemplatesGalleryPage.tsx
// gallery landing — two-tone hero w/ CTA pair, search, hero tile + sidebar
// featured row, rails, filterable browse grid, & closing CTA

import {
  Flame,
  ListChecks,
  ListFilter,
  Plus,
  Sparkles,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  TEMPLATE_LIST_SORTS,
  type TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'

import {
  Card,
  type CardFeaturedLabel,
} from '~/features/marketplace/components/cards/Card'
import { CategoryChips } from '~/features/marketplace/components/discovery/CategoryChips'
import { CreateTile } from '~/features/marketplace/components/cards/CreateTile'
import { DraftRail } from '~/features/marketplace/components/discovery/DraftRail'
import { Hero } from '~/features/marketplace/components/discovery/Hero'
import { Rail } from '~/features/marketplace/components/discovery/Rail'
import { RailHeader } from '~/features/marketplace/components/discovery/RailHeader'
import { SearchInput } from '~/features/marketplace/components/discovery/SearchInput'
import { Button } from '~/shared/ui/Button'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { useGalleryFilters } from '~/features/marketplace/model/useGalleryFilters'
import { useOpenTemplateDraft } from '~/features/marketplace/model/useOpenTemplateDraft'
import { useTemplatesGallery } from '~/features/marketplace/model/useTemplatesGallery'
import { useStartBlankBoard } from '~/features/workspace/boards/model/useStartBlankBoard'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { formatCount } from '~/shared/catalog/formatters'
import { pluralizeWord } from '~/shared/lib/pluralize'
import {
  loadPublishModal,
  preloadPublishModal,
} from '~/features/marketplace/components/publish/loadPublishModal'
import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { SkeletonCard } from '~/shared/ui/Skeleton'
import { createTypedSelectChangeHandler } from '~/shared/ui/selectChange'

const PublishModal = lazyNamed(loadPublishModal, 'PublishModal')

const SORT_LABELS: Record<TemplateListSort, string> = {
  featured: 'Featured',
  trending: 'Trending',
  popular: 'Most popular',
  recent: 'Recently added',
}

// three peer featured tiles in editorial register. Hero takes the
// editor's-pick slot; the two sidebar tiles render as elevated Cards. no rail
// header — each tile's featuredLabel chip identifies its role
const HERO_FEATURED_LABELS = [
  'editorsPick',
  'trending',
  'curated',
] as const satisfies readonly CardFeaturedLabel[]

const NewBoardCta = ({ onClick }: { onClick: () => void }) => (
  <Button
    variant="primary"
    tone="accent"
    size="md"
    onClick={onClick}
    aria-label="Create a new board"
  >
    <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
    New board
  </Button>
)

const railMeta = (
  items: readonly unknown[] | undefined,
  word: string
): string | undefined =>
  items !== undefined
    ? `${formatCount(items.length)} ${pluralizeWord(items.length, word)}`
    : undefined

interface EmptyHintFilters
{
  tag: string | null
  searchDebounced: string
  category: TemplateCategory | null
}

interface BrowseHeadingFilters
{
  searchDebounced: string
  tag: string | null
  category: TemplateCategory | null
}

const getBrowseHeading = (filters: BrowseHeadingFilters): string =>
{
  const parts = [
    filters.searchDebounced ? `Results for "${filters.searchDebounced}"` : null,
    filters.tag ? `#${filters.tag}` : null,
    filters.category ? CATEGORY_META[filters.category].label : null,
  ].filter((part): part is string => part !== null)

  return parts.length === 0 ? 'Browse everything' : parts.join(' · ')
}

const formatTemplateResultsCount = (count: number, atLimit: boolean): string =>
  `${count}${atLimit ? '+' : ''} ${pluralizeWord(count, 'template')}`

const getEmptyGalleryHint = (filters: EmptyHintFilters): string =>
{
  if (filters.tag)
  {
    return 'Try removing the tag or picking a different category.'
  }
  if (filters.searchDebounced)
  {
    return 'Try clearing the search or picking a different category.'
  }
  if (filters.category) return 'Try a different category.'
  return 'Check back soon — the gallery is still filling out.'
}

const GridSkeleton = () => (
  <>
    {Array.from({ length: 7 }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </>
)

export const TemplatesGalleryPage = () =>
{
  const filters = useGalleryFilters()
  const session = useAuthSession()
  const showSignIn = useSignInPromptStore((state) => state.show)
  const isSignedIn = session.status === 'signed-in'
  const galleryAccessRefreshKey =
    session.status === 'signed-in'
      ? `${session.user._id}:${session.user.plan}`
      : session.status
  const gallery = useTemplatesGallery(filters, {
    includeDrafts: isSignedIn,
    accessRefreshKey: galleryAccessRefreshKey,
  })
  const draftAction = useOpenTemplateDraft()
  const [publishOpen, setPublishOpen] = useState(false)
  const { start: handleStartBlankBoard } = useStartBlankBoard()
  useDocumentTitle('Templates · TierListBuilder')
  const handleSortChange = createTypedSelectChangeHandler(
    TEMPLATE_LIST_SORTS,
    filters.setSort
  )

  // hero secondary CTA scrolls to the trending rail when it's rendered.
  // rail is gated on filters & server-side availability; missing ref no-ops
  const trendingSectionRef = useRef<HTMLElement | null>(null)
  const handleScrollToTrending = () =>
  {
    trendingSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const heroFeatured = useMemo(
    () =>
      HERO_FEATURED_LABELS.flatMap((label, index) =>
      {
        const template = gallery.featured?.[index]
        return template ? [{ template, label }] : []
      }),
    [gallery.featured]
  )

  const filtersActive =
    !!filters.searchDebounced ||
    filters.category !== null ||
    filters.tag !== null
  const showRails = !filtersActive
  const showJumpBackRail =
    showRails &&
    isSignedIn &&
    (gallery.drafts === undefined || gallery.drafts.length > 0)
  // chip counts are global per-category. they're misleading once a search or
  // tag has narrowed the dataset, so suppress them in those modes & let chips
  // render labels alone
  const showChipCounts = !filters.searchDebounced && !filters.tag
  const browseHeading = getBrowseHeading(filters)
  // results.length tops out at the page limit. show a "+" suffix so a full
  // page reads as "potentially more" rather than the exact total
  const resultsAtLimit =
    gallery.results !== undefined &&
    gallery.results.length === DEFAULT_TEMPLATE_LIST_LIMIT
  const browseSubhead = gallery.results
    ? formatTemplateResultsCount(gallery.results.length, resultsAtLimit)
    : 'Loading…'
  const templateCountLabel =
    gallery.templateCount === undefined
      ? 'Templates marketplace'
      : `Templates · ${formatCount(gallery.templateCount.count)} available`

  const handleCreateTileClick = () =>
  {
    if (!isSignedIn)
    {
      showSignIn()
      return
    }
    setPublishOpen(true)
  }

  // anchor the browse section's window position across filter toggles.
  // capture before state changes; rect.top is post-shift after re-render.
  // restore in a layout effect so scroll adjusts before paint.
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
  }, [filters.category, filters.tag, filters.searchDebounced])

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
  // capture only when typing toggles the rails-visibility predicate. capture
  // fires in setSearch (before debounce) so the captured rect.top is the
  // pre-flip position; the layout-effect restores after the debounce flips
  const handleSearchChange = (next: string) =>
  {
    const wasSearchActive = !!filters.searchDebounced
    const willSearchActivate = next.trim().length > 0
    if (wasSearchActive !== willSearchActivate)
    {
      captureBrowseAnchor()
    }
    filters.setSearch(next)
  }

  const handleClearFilters = () =>
  {
    captureBrowseAnchor()
    filters.setSearch('')
    filters.setTag(null)
    filters.setCategory(null)
  }

  return (
    <>
      <section className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pt-20 sm:px-10 sm:pt-24">
        <DisplayHeadline
          eyebrow={templateCountLabel}
          accent="community templates"
          subtitle={
            <>
              Pre-built item sets you can fork into a new ranking with{' '}
              <strong className="font-bold text-[var(--t-text)]">
                one click
              </strong>
              .
            </>
          }
          size="display"
          maxWidthClassName="max-w-none"
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <NewBoardCta onClick={handleStartBlankBoard} />
            <Button
              variant="secondary"
              size="md"
              onClick={handleScrollToTrending}
            >
              Browse trending
            </Button>
          </div>
          <SearchInput
            value={filters.searchInput}
            onChange={handleSearchChange}
          />
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

      {showRails && heroFeatured.length > 0 && (
        <section className="relative z-10 mx-auto mt-12 w-full max-w-[1200px] px-6 sm:px-10">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Hero template={heroFeatured[0].template} />
            <div className="flex flex-col gap-5">
              {heroFeatured.slice(1).map(({ template, label }) => (
                <Card
                  key={template.slug}
                  template={template}
                  size="small"
                  featuredLabel={label}
                  coverSurface="browseHero"
                  imageLoading="eager"
                  elevated
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {showRails && (
        <>
          {gallery.showTrendingRail && (
            <section
              ref={trendingSectionRef}
              className="relative z-10 mx-auto mt-10 w-full max-w-[1200px] scroll-mt-24 px-6 sm:px-10"
            >
              <RailHeader
                title="Trending this week"
                subtitle="Hottest forks in the last 7 days"
                icon={Flame}
                meta={railMeta(gallery.trending, 'template')}
              />
              <Rail items={gallery.trending} size="small" />
            </section>
          )}

          {gallery.showPopularRail && (
            <section className="relative z-10 mx-auto mt-10 w-full max-w-[1200px] px-6 sm:px-10">
              <RailHeader
                title="Most popular"
                subtitle="All-time forks"
                icon={TrendingUp}
                meta={railMeta(gallery.popular, 'template')}
              />
              <Rail items={gallery.popular} size="small" />
            </section>
          )}

          <section className="relative z-10 mx-auto mt-10 w-full max-w-[1200px] px-6 sm:px-10">
            <RailHeader
              title="New & recently updated"
              subtitle="Fresh from creators"
              icon={Sparkles}
              meta={railMeta(gallery.recent, 'template')}
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
            <DisplayHeadline
              primary={browseHeading}
              subtitle={browseSubhead}
              subtitleClassName="text-xs text-[var(--t-text-muted)]"
              size="section"
              as="h2"
              maxWidthClassName="max-w-2xl"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filters.tag && (
              <button
                type="button"
                onClick={handleTagClear}
                aria-label={`Remove tag filter "${filters.tag}"`}
                className="focus-custom inline-flex items-center gap-1 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
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
              className={`flex items-center gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs text-[var(--t-text-secondary)] ${
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
                // tag listings are forced to recent server-side; reflect that
                // in the displayed value instead of leaving the user's prior
                // selection visible against an order the query no longer honors
                value={filters.tag !== null ? 'recent' : filters.sort}
                onChange={handleSortChange}
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
              <span className="inline-flex items-center gap-1 rounded-md bg-[rgb(var(--t-overlay)/0.06)] px-3 py-1.5 text-xs text-[var(--t-text-secondary)]">
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
            counts={
              showChipCounts
                ? gallery.templateCount?.countByCategory
                : undefined
            }
            totalCount={
              showChipCounts ? gallery.templateCount?.count : undefined
            }
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {!filtersActive && (
            <CreateTile
              onClick={handleCreateTileClick}
              onIntent={preloadPublishModal}
              size="default"
            />
          )}
          {gallery.results ? (
            gallery.results.map((template, index) => (
              <Card
                key={template.slug}
                template={template}
                size="default"
                imageLoading={filtersActive && index < 4 ? 'eager' : undefined}
              />
            ))
          ) : (
            <GridSkeleton />
          )}
        </div>

        {gallery.results && gallery.results.length === 0 && (
          <EmptyCard
            className="mt-8"
            padding="lg"
            titleWeight="medium"
            title="No templates match your filters."
            body={getEmptyGalleryHint(filters)}
            action={
              filtersActive ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="focus-custom inline-flex items-center gap-1.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                >
                  <X className="h-3 w-3" strokeWidth={1.8} />
                  Clear filters
                </button>
              ) : null
            }
          />
        )}
      </section>

      <section className="relative z-10 mx-auto mt-16 mb-16 w-full max-w-[1200px] px-6 sm:px-10">
        <div className="rounded-2xl border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] px-8 py-12 sm:px-14 sm:py-16">
          <DisplayHeadline
            primary="Start a"
            accent="New board"
            subtitle="Pick a template above or start from blank — your ranking lives in your workspace until you're ready to publish."
            size="display"
            stacked
          />
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <NewBoardCta onClick={handleStartBlankBoard} />
          </div>
        </div>
      </section>

      <LazyModalSlot when={publishOpen} section="publish template">
        {() => (
          <PublishModal
            open
            onClose={() => setPublishOpen(false)}
            onPublished={() => void gallery.refresh()}
          />
        )}
      </LazyModalSlot>
    </>
  )
}
