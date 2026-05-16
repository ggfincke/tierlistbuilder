// src/features/marketplace/components/template/TemplateHero.tsx
// 3-column hero: cover (w/ bottom stats strip + spread chip) | meta column |
// optional right rail slot for editorial cards

import {
  Bookmark,
  BookmarkCheck,
  Clock,
  Gamepad2,
  Hash,
  Printer,
  Sparkles,
  TrendingUp,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { TEMPLATE_STAT_META } from '~/features/marketplace/model/templateStatMeta'
import {
  useTemplateBookmarkState,
  useToggleTemplateBookmarkMutation,
} from '~/features/marketplace/model/useTemplateDetail'
import {
  type AuthSession,
  useAuthSession,
} from '~/features/platform/auth/model/useAuthSession'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { logger } from '~/shared/lib/logger'
import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { pluralizeWord } from '~/shared/lib/pluralize'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { InitialAvatar } from '~/shared/ui/InitialAvatar'

import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { Cover } from '../cover/Cover'
import { MetaPill } from '../MetaPill'
import { ShareTemplateButton } from './ShareTemplateButton'
import { UseTemplateButton } from '../cards/UseTemplateButton'

// sentinel: page passes this as `rightRail` to keep the 3-col grid stable
// when the current lane has no rail content but other lanes do. The hero
// then renders an empty placeholder aside instead of collapsing to 2 cols
export const RESERVED_RAIL: unique symbol = Symbol('TemplateHero.RESERVED_RAIL')

interface TemplateHeroProps
{
  template: MarketplaceTemplateDetail
  hasConsensus: boolean
  rankingCount: number
  // counts of items whose modal tier is each bucket — drives the spread chip
  // top-right of the cover. omit to hide the chip
  spreadCounts?: ReadonlyArray<{
    index: number
    label: string
    color: string
    count: number
  }>
  rightRail?: ReactNode | typeof RESERVED_RAIL
}

interface SecondaryIconButtonProps
{
  ariaLabel: string
  title?: string
  icon: LucideIcon
  onClick?: () => void
  disabled?: boolean
}

const SecondaryIconButton = ({
  ariaLabel,
  title,
  icon: Icon,
  onClick,
  disabled,
}: SecondaryIconButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    title={title ?? ariaLabel}
    className="focus-custom inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-50"
  >
    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
  </button>
)

const BOOKMARK_TITLE_BY_STATE = {
  signedOut: 'Sign in to save templates',
  saved: 'Remove saved template',
  unsaved: 'Save to library',
} as const

const getBookmarkButtonTitle = (
  session: AuthSession,
  saved: boolean
): string =>
{
  if (session.status !== 'signed-in') return BOOKMARK_TITLE_BY_STATE.signedOut
  return saved ? BOOKMARK_TITLE_BY_STATE.saved : BOOKMARK_TITLE_BY_STATE.unsaved
}

const BookmarkButton = ({ slug }: { slug: string }) =>
{
  const session = useAuthSession()
  const bookmark = useTemplateBookmarkState(
    slug,
    session.status === 'signed-in'
  )
  const toggleBookmark = useToggleTemplateBookmarkMutation()
  const [pending, setPending] = useState(false)
  const saved = bookmark?.saved === true
  const Icon = saved ? BookmarkCheck : Bookmark
  const title = getBookmarkButtonTitle(session, saved)

  const handleClick = async (): Promise<void> =>
  {
    if (session.status !== 'signed-in')
    {
      promptSignIn()
      return
    }
    if (pending) return
    setPending(true)
    try
    {
      await toggleBookmark({ templateSlug: slug, saved: !saved })
    }
    catch (error)
    {
      logger.warn('marketplace', 'toggleTemplateBookmark failed', error)
    }
    finally
    {
      setPending(false)
    }
  }

  return (
    <SecondaryIconButton
      ariaLabel={saved ? 'Remove saved template' : 'Save to library'}
      title={title}
      icon={Icon}
      onClick={() => void handleClick()}
      disabled={pending || session.status === 'loading'}
    />
  )
}

const handlePrint = (): void =>
{
  if (typeof window !== 'undefined') window.print()
}

const COVER_HEIGHT = 'h-72 sm:h-80 lg:h-[32rem]'

interface HeroStat
{
  label: string
  value: string
  // a zero count dims rather than shouts a placeholder on a fresh template
  muted: boolean
}

const HeroStatStrip = ({ stats }: { stats: readonly HeroStat[] }) => (
  <div className="grid shrink-0 grid-cols-4 divide-x divide-white/10 border-t border-white/10 bg-black/70 px-1 py-1.5 text-white">
    {stats.map((stat) => (
      <div key={stat.label} className="px-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
          {stat.label}
        </p>
        <p
          className={`font-mono text-base font-bold leading-tight tabular-nums ${
            stat.muted ? 'text-white/40' : 'text-white'
          }`}
        >
          {stat.value}
        </p>
      </div>
    ))}
  </div>
)

export const TemplateHero = ({
  template,
  hasConsensus,
  rankingCount,
  spreadCounts,
  rightRail,
}: TemplateHeroProps) =>
{
  const hasRailContent = rightRail != null && rightRail !== RESERVED_RAIL
  const useRailGrid = hasRailContent || rightRail === RESERVED_RAIL
  const categoryLabel = CATEGORY_META[template.category].label
  const hasBakedLabels = template.labels?.show === true
  // rankingCount comes from the active-lane prop, not the template total, so
  // the strip echoes the same count the consensus header below it shows
  const coverStats: readonly HeroStat[] = TEMPLATE_STAT_META.map((stat) =>
  {
    const raw = stat.key === 'rankingCount' ? rankingCount : template[stat.key]
    return { label: stat.label, value: formatCount(raw), muted: raw <= 0 }
  })

  // chip-aligned spread max so each bucket's bar is visually comparable
  const spreadMax = useMemo(
    () =>
      spreadCounts && spreadCounts.length > 0
        ? Math.max(1, ...spreadCounts.map((entry) => entry.count))
        : 0,
    [spreadCounts]
  )
  const showSpreadChip = hasConsensus && spreadMax > 0

  return (
    <header
      className={
        useRailGrid
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)_320px] lg:grid-rows-[32rem] lg:items-stretch'
          : 'grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[32rem] lg:items-stretch'
      }
    >
      <div
        className={`relative flex flex-col overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] ${COVER_HEIGHT}`}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Cover
            template={{
              ...template,
              coverItems: template.coverItems,
            }}
            density="hero"
            surface="detailHero"
          />

          {showSpreadChip && spreadCounts && (
            <div
              className="absolute right-3 top-3 flex items-end gap-[3px] rounded-md border border-white/10 bg-black/45 px-2 py-1.5 backdrop-blur"
              aria-label="Tier spread across the community"
            >
              {spreadCounts.map((entry) => (
                <span
                  key={entry.index}
                  className="block w-1.5 rounded-sm"
                  style={{
                    height: `${4 + (entry.count / spreadMax) * 22}px`,
                    background: entry.color,
                  }}
                  title={`${entry.label}: ${entry.count} ${entry.count === 1 ? 'item' : 'items'}`}
                />
              ))}
              <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/85">
                spread
              </span>
            </div>
          )}
        </div>

        <HeroStatStrip stats={coverStats} />
      </div>

      <div className="flex min-w-0 flex-col lg:h-[32rem]">
        <div className="flex flex-wrap items-center gap-1.5">
          <MetaPill icon={Gamepad2} tone="accent">
            {categoryLabel}
          </MetaPill>
          {template.featuredRank !== null && (
            <MetaPill icon={Sparkles}>Editor’s pick</MetaPill>
          )}
          {hasConsensus ? (
            <MetaPill icon={TrendingUp}>
              {formatCount(rankingCount)}{' '}
              {pluralizeWord(rankingCount, 'ranking')}
            </MetaPill>
          ) : (
            <MetaPill icon={Clock}>Awaiting rankings</MetaPill>
          )}
          {hasBakedLabels && <MetaPill icon={Type}>Labeled</MetaPill>}
        </div>

        <DisplayHeadline
          primary={template.title}
          size="page"
          maxWidthClassName="max-w-xl"
          className="mt-3"
        />

        {template.description && (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--t-text-muted)]">
            {template.description}
          </p>
        )}

        <div className="mt-auto pt-6">
          <div className="flex items-center gap-2.5">
            <InitialAvatar
              name={template.author.displayName}
              size="sm"
              className="h-9 w-9"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--t-text)]">
                {template.author.displayName}
              </p>
              <p className="text-xs text-[var(--t-text-faint)]">
                Updated {formatRelativeTime(template.updatedAt)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-stretch gap-2">
            <UseTemplateButton
              slug={template.slug}
              templateTitle={template.title}
              access={template.access}
              size="md"
              className="h-11 flex-1 px-5 text-sm"
            />
            <BookmarkButton slug={template.slug} />
            <ShareTemplateButton
              slug={template.slug}
              templateTitle={template.title}
              ariaLabel={`Share ${template.title}`}
              className="focus-custom inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            />
            <SecondaryIconButton
              ariaLabel="Print this template"
              title="Print-friendly view"
              icon={Printer}
              onClick={handlePrint}
            />
          </div>

          {template.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {template.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`${TEMPLATES_ROUTE_PATH}?tag=${encodeURIComponent(tag)}`}
                  className="focus-custom inline-flex items-center gap-0.5 rounded-md border border-[var(--t-border)] px-2 py-0.5 text-[11px] text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                >
                  <Hash className="h-2.5 w-2.5" strokeWidth={2} />
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasRailContent ? (
        <aside className="flex min-w-0 flex-col gap-3 lg:overflow-hidden">
          {rightRail}
        </aside>
      ) : rightRail === RESERVED_RAIL ? (
        <aside aria-hidden="true" className="hidden lg:block" />
      ) : null}
    </header>
  )
}
