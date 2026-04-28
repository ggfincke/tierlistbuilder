// src/features/marketplace/components/Card.tsx
// repeat-unit template card used by the gallery grid & section rails — three
// sizes share the same chrome but vary in art height & meta density

import {
  BadgeCheck,
  Clock,
  Eye,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { Link } from 'react-router-dom'

import type { MarketplaceTemplateSummary } from '@tierlistbuilder/contracts/marketplace/template'

import {
  formatCount,
  formatRelativeTime,
  formatTimeToRank,
} from '~/features/marketplace/model/formatters'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { Cover, type CoverStyle } from './Cover'
import type { MosaicDensity } from './Mosaic'

export type CardSize = 'small' | 'default' | 'large'

// homepage curation slot. drives the top-left badge text & icon — independent
// of the row's stored featuredRank so an unranked template can still appear in
// a "trending" position when a query orders by useCount instead
export type CardFeaturedLabel = 'editorsPick' | 'trending' | 'curated'

interface CardProps
{
  template: MarketplaceTemplateSummary
  size?: CardSize
  // override cover treatment for stylistic variants (eg trending/curated rails
  // pass 'initials' so labels render instead of an image mosaic)
  coverStyle?: CoverStyle
  // homepage hero/trending/curated slot — when set, replaces the generic
  // "Featured" pill w/ a slot-specific label & icon
  featuredLabel?: CardFeaturedLabel
}

const FEATURED_LABEL_META: Record<
  CardFeaturedLabel,
  { text: string; icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
  editorsPick: { text: "Editor's pick", icon: Sparkles },
  trending: { text: 'Trending', icon: TrendingUp },
  curated: { text: 'Curated', icon: BadgeCheck },
}

const SIZE_CONFIG: Record<
  CardSize,
  {
    coverHeight: string
    titleClass: string
    metaClass: string
    bodyPad: string
    density: MosaicDensity
  }
> = {
  small: {
    coverHeight: 'h-32',
    titleClass: 'text-[13px]',
    metaClass: 'text-[10px]',
    bodyPad: 'px-3 py-2.5',
    density: 'small',
  },
  default: {
    coverHeight: 'h-40',
    titleClass: 'text-sm',
    metaClass: 'text-[11px]',
    bodyPad: 'px-3.5 py-3',
    density: 'default',
  },
  large: {
    coverHeight: 'h-56',
    titleClass: 'text-base',
    metaClass: 'text-xs',
    bodyPad: 'px-4 py-3.5',
    density: 'large',
  },
}

export const Card = ({
  template,
  size = 'default',
  coverStyle,
  featuredLabel,
}: CardProps) =>
{
  const cfg = SIZE_CONFIG[size]
  const detailPath = `${TEMPLATES_ROUTE_PATH}/${template.slug}`
  const labelMeta = featuredLabel ? FEATURED_LABEL_META[featuredLabel] : null
  const showGenericFeatured = !labelMeta && template.featuredRank !== null
  const LabelIcon = labelMeta?.icon

  return (
    <Link
      to={detailPath}
      className="group focus-custom relative flex h-full flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] transition hover:-translate-y-0.5 hover:border-[var(--t-border-hover)] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      aria-label={`${template.title} — by ${template.author.displayName}`}
    >
      <div className={`relative w-full overflow-hidden ${cfg.coverHeight}`}>
        <Cover template={template} density={cfg.density} style={coverStyle} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/80 via-black/35 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          {labelMeta && LabelIcon ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur">
              <LabelIcon className="h-3 w-3" strokeWidth={2} />
              {labelMeta.text}
            </span>
          ) : showGenericFeatured ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur">
              Featured
            </span>
          ) : null}
          <span className="ml-auto rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            {template.itemCount} {template.itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 pb-2">
          <span
            className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur"
            style={{ boxShadow: '0 0 0 1px rgb(255 255 255 / 0.06)' }}
          >
            {CATEGORY_META[template.category].label}
          </span>
        </div>
      </div>

      <div
        className={`flex flex-1 flex-col gap-2 ${cfg.bodyPad} text-[var(--t-text)]`}
      >
        <h3
          className={`line-clamp-2 font-semibold leading-snug ${cfg.titleClass}`}
        >
          {template.title}
        </h3>

        {size !== 'small' && (
          <div
            className={`flex items-center gap-1.5 ${cfg.metaClass} text-[var(--t-text-muted)]`}
          >
            <span
              aria-hidden="true"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--t-bg-active)] text-[9px] font-semibold text-[var(--t-text)]"
            >
              {template.author.displayName
                .replace(/^@/, '')
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <span className="truncate">{template.author.displayName}</span>
          </div>
        )}

        <div
          className={`mt-auto flex items-center gap-3 ${cfg.metaClass} text-[var(--t-text-faint)]`}
        >
          <span
            className="inline-flex items-center gap-1"
            title={`${template.useCount} forks`}
          >
            <Layers className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(template.useCount)}
          </span>
          <span
            className="inline-flex items-center gap-1"
            title={`${template.viewCount} views`}
          >
            <Eye className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(template.viewCount)}
          </span>
          <span
            className="inline-flex items-center gap-1"
            title="Estimated time to rank"
          >
            <Clock className="h-3 w-3" strokeWidth={1.8} />
            {formatTimeToRank(template.itemCount)}
          </span>
          <span className="ml-auto text-[var(--t-text-dim)]">
            {formatRelativeTime(template.updatedAt)}
          </span>
        </div>

        {size === 'large' && template.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {template.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-[rgb(var(--t-overlay)/0.06)] px-1.5 py-0.5 text-[10px] text-[var(--t-text-muted)]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
