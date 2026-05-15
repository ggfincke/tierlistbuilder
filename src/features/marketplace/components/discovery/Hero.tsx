// src/features/marketplace/components/discovery/Hero.tsx
// large featured-template tile rendered at the top of the gallery — cover art
// w/ a soft fade & a meta band carrying badges, title, & "View template"

import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { MarketplaceTemplateSummary } from '@tierlistbuilder/contracts/marketplace/template'

import { formatCount } from '~/shared/catalog/formatters'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { TEMPLATE_STAT_META } from '~/features/marketplace/model/templateStatMeta'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { Cover, type CoverStyle } from '../cover/Cover'

interface HeroProps
{
  template: MarketplaceTemplateSummary
  coverStyle?: CoverStyle
}

export const Hero = ({ template, coverStyle = 'auto' }: HeroProps) => (
  <Link
    to={`${TEMPLATES_ROUTE_PATH}/${template.slug}`}
    className="group focus-custom relative flex h-full min-h-[22rem] flex-col overflow-hidden rounded-lg border border-[var(--t-border)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:min-h-[26rem]"
    aria-label={`Featured: ${template.title}`}
  >
    <div className="relative w-full flex-1 overflow-hidden">
      <Cover
        template={template}
        density="hero"
        style={coverStyle}
        surface="browseHero"
        loading="eager"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-black/95" />
      <div className="pointer-events-none absolute inset-x-0 bottom-2/5 h-1/5 bg-gradient-to-t from-black/95 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-white uppercase backdrop-blur-sm"
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
            Editor's pick
          </span>
          <span
            className="rounded bg-black/55 px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-white/85 uppercase backdrop-blur-sm"
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            {CATEGORY_META[template.category].label}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {template.title}
          </h2>
          {template.description && (
            <p className="line-clamp-2 max-w-2xl text-sm text-white/85">
              {template.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--t-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--t-accent-foreground)] shadow-[2px_2px_0_var(--t-accent-2)] transition-[transform,box-shadow] duration-100 group-hover:-translate-x-px group-hover:-translate-y-px group-hover:shadow-[3px_3px_0_var(--t-accent-2)]">
            View template
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <div
            className="flex items-center gap-4 text-xs"
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            {TEMPLATE_STAT_META.map(({ key, label, icon: Icon }) =>
            {
              const value = template[key]
              return (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1 tabular-nums ${
                    value <= 0 ? 'text-white/40' : 'text-white/75'
                  }`}
                  title={`${value} ${label}`}
                >
                  <Icon className="h-3 w-3" strokeWidth={1.8} aria-hidden />
                  {formatCount(value)}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  </Link>
)
