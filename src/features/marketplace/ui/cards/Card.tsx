// src/features/marketplace/ui/cards/Card.tsx
// repeat-unit template card used by the gallery grid & section rails — three
// sizes share the same chrome but vary in art height & meta density

import {
  ArrowRight,
  BadgeCheck,
  Lock,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { memo, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { Link } from 'react-router-dom'

import type {
  CoverSurface,
  MarketplaceTemplateSummary,
  TemplateCardAccessState,
} from '@tierlistbuilder/contracts/marketplace/template'

import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { ACCESS_META } from '~/features/marketplace/model/accessMeta'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { TEMPLATE_STAT_META } from '~/features/marketplace/model/templateStatMeta'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { CHUNKY_SHADOW_ACCENT_STATIC } from '~/shared/ui/chunkyShadow'
import { InitialAvatar } from '~/shared/ui/InitialAvatar'
import type { MediaLoading } from '~/shared/board-ui/mediaImageAttrs'
import { Cover, type CoverStyle } from '../cover/Cover'
import type { MosaicDensity } from '../discovery/Mosaic'

export type CardSize = 'small' | 'default' | 'large'

// homepage curation slot. drives the top-left badge text & icon — independent
// of the row's stored featuredRank so an unranked template can still appear in
// a "trending" position when a query orders by forkCount instead
export type CardFeaturedLabel = 'editorsPick' | 'trending' | 'curated'

interface CardProps
{
  template: MarketplaceTemplateSummary & { access?: TemplateCardAccessState }
  size?: CardSize
  // override cover treatment for stylistic variants (eg trending/curated rails
  // pass 'initials' so labels render instead of an image mosaic)
  coverStyle?: CoverStyle
  // homepage hero/trending/curated slot — when set, replaces the generic
  // "Featured" pill w/ a slot-specific label & icon
  featuredLabel?: CardFeaturedLabel
  imageLoading?: MediaLoading
  coverSurface?: CoverSurface
  // editorial elevation — adds an accent border + soft accent glow & tints the
  // category eyebrow. used by the gallery's 3-up featured row to lift the
  // editor's-pick/trending/curated tiles a tier above the generic grid
  elevated?: boolean
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
    statGap: string
    bodyPad: string
    density: MosaicDensity
  }
> = {
  small: {
    coverHeight: 'h-32',
    titleClass: 'text-[13px]',
    metaClass: 'text-[10px]',
    statGap: 'gap-2',
    bodyPad: 'px-3 py-2.5',
    density: 'small',
  },
  default: {
    coverHeight: 'h-40',
    titleClass: 'text-sm',
    metaClass: 'text-[11px]',
    statGap: 'gap-2.5',
    bodyPad: 'px-3.5 py-3',
    density: 'default',
  },
  large: {
    coverHeight: 'h-56',
    titleClass: 'text-base',
    metaClass: 'text-xs',
    statGap: 'gap-3',
    bodyPad: 'px-4 py-3.5',
    density: 'large',
  },
}

interface CardStatProps
{
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  value: number
}

// one community stat — a zero value demotes to the dim token so a freshly
// published template reads honest instead of shouting placeholder zeroes
const CardStat = ({ icon: Icon, label, value }: CardStatProps) =>
{
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        value <= 0 ? 'text-[var(--t-text-dim)]' : 'text-[var(--t-text-faint)]'
      }`}
      style={{ fontFamily: 'var(--ts-mono)' }}
      title={`${value} ${label}`}
    >
      <Icon className="h-3 w-3" strokeWidth={1.8} aria-hidden />
      {formatCount(value)}
    </span>
  )
}

// edit-time eyebrow + frame palettes — keyed off the editorial-elevated flag.
// elevated cards carry an accent border & tint the category eyebrow (no
// halo — the TRENDING/CURATED corner pills already signal 'featured')
const FRAME_BASE =
  'group focus-custom relative flex h-full flex-col overflow-hidden rounded-lg border bg-[var(--t-bg-surface)] transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

const FRAME_DEFAULT =
  'border-[var(--t-border)] hover:border-[var(--t-border-hover)] hover:shadow-lg'

const FRAME_ELEVATED = 'border-[var(--t-accent)]'

const OVERLAY_CHIP_CLASS =
  'inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-[9px] font-semibold tracking-[0.16em] text-white uppercase backdrop-blur-sm'

interface OverlayChipProps
{
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  alignEnd?: boolean
  children: ReactNode
}

const OverlayChip = ({
  icon: Icon,
  alignEnd = false,
  children,
}: OverlayChipProps) => (
  <span
    className={`${alignEnd ? 'ml-auto ' : ''}${OVERLAY_CHIP_CLASS}`}
    style={{ fontFamily: 'var(--ts-mono)' }}
  >
    {Icon && <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />}
    {children}
  </span>
)

const CardImpl = ({
  template,
  size = 'default',
  coverStyle,
  featuredLabel,
  imageLoading,
  coverSurface = 'card',
  elevated = false,
}: CardProps) =>
{
  const cfg = SIZE_CONFIG[size]
  const detailPath = `${TEMPLATES_ROUTE_PATH}/${template.slug}`
  const labelMeta = featuredLabel ? FEATURED_LABEL_META[featuredLabel] : null
  const showGenericFeatured = !labelMeta && template.featuredRank !== null
  const accessLabel = template.access
    ? ACCESS_META[template.access].chipLabel
    : null
  const LabelIcon = labelMeta?.icon
  const hasOverlayChip = Boolean(
    labelMeta || showGenericFeatured || accessLabel
  )
  const frameClasses = `${FRAME_BASE} ${
    elevated ? FRAME_ELEVATED : FRAME_DEFAULT
  }`
  const tintCategory = elevated || labelMeta !== null

  return (
    <Link
      to={detailPath}
      className={frameClasses}
      aria-label={`${template.title} — by ${template.author.displayName}`}
    >
      <div className={`relative w-full overflow-hidden ${cfg.coverHeight}`}>
        <Cover
          template={template}
          density={cfg.density}
          style={coverStyle}
          surface={coverSurface}
          loading={imageLoading}
        />

        {hasOverlayChip && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/80 via-black/35 to-transparent" />
            <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start gap-2">
              {labelMeta && LabelIcon ? (
                <OverlayChip icon={LabelIcon}>{labelMeta.text}</OverlayChip>
              ) : showGenericFeatured ? (
                <OverlayChip>Featured</OverlayChip>
              ) : null}
              {accessLabel && (
                <OverlayChip icon={Lock} alignEnd>
                  {accessLabel}
                </OverlayChip>
              )}
            </div>
          </>
        )}

        {/* hover CTA — the whole card links to detail; this names the move */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-2.5 opacity-0 transition group-hover:opacity-100"
          style={{
            background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
          }}
        >
          <span
            className={`inline-flex items-center gap-1 rounded-md bg-[var(--t-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--t-accent-foreground)] ${CHUNKY_SHADOW_ACCENT_STATIC}`}
          >
            View
            <ArrowRight className="h-3 w-3" strokeWidth={2.4} aria-hidden />
          </span>
        </div>
      </div>

      <div
        className={`flex flex-1 flex-col gap-1.5 ${cfg.bodyPad} text-[var(--t-text)]`}
      >
        <div
          className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          <span
            className={`min-w-0 truncate ${
              tintCategory ? 'text-[var(--t-accent)]' : ''
            }`}
          >
            {CATEGORY_META[template.category].label}
          </span>
          <span className="shrink-0">
            {formatRelativeTime(template.updatedAt)}
          </span>
        </div>

        <h3
          className={`line-clamp-2 font-bold leading-tight tracking-[-0.015em] ${cfg.titleClass}`}
        >
          {template.title}
        </h3>

        {size !== 'small' && (
          <div
            className={`flex items-center gap-1.5 ${cfg.metaClass} text-[var(--t-text-muted)]`}
          >
            <InitialAvatar name={template.author.displayName} size="xs" />
            <span className="truncate">{template.author.displayName}</span>
          </div>
        )}

        <div
          className={`mt-auto flex items-center ${cfg.statGap} ${cfg.metaClass}`}
        >
          {TEMPLATE_STAT_META.map((stat) => (
            <CardStat
              key={stat.key}
              icon={stat.icon}
              label={stat.label}
              value={template[stat.key]}
            />
          ))}
        </div>

        {size === 'large' && template.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {template.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-[rgb(var(--t-overlay)/0.06)] px-1.5 py-0.5 text-[10px] text-[var(--t-text-muted)]"
                style={{ fontFamily: 'var(--ts-mono)' }}
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

export const Card = memo(CardImpl)
