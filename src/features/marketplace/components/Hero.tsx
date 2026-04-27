// src/features/marketplace/components/Hero.tsx
// large featured-template tile rendered at the top of the gallery — initials
// cover w/ a soft fade & a meta band carrying badges, title, & "Use template"

import { ArrowRight, Clock, Eye, Layers, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { MarketplaceTemplateSummary } from '@tierlistbuilder/contracts/marketplace/template'

import {
  formatCount,
  formatTimeToRank,
} from '~/features/marketplace/model/formatters'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { Cover, type CoverStyle } from './Cover'

interface HeroProps
{
  template: MarketplaceTemplateSummary
  coverStyle?: CoverStyle
}

export const Hero = ({ template, coverStyle = 'auto' }: HeroProps) => (
  <Link
    to={`${TEMPLATES_ROUTE_PATH}/${template.slug}`}
    className="group focus-custom relative block overflow-hidden rounded-2xl border border-[var(--t-border)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
    aria-label={`Featured: ${template.title}`}
  >
    <div className="relative h-[22rem] w-full overflow-hidden sm:h-[26rem]">
      <Cover template={template} density="hero" style={coverStyle} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/75 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase text-white backdrop-blur">
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            Editor's pick
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase text-white/85 backdrop-blur">
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
          <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition group-hover:bg-white/90">
            Use this template
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <div className="flex items-center gap-4 text-xs text-white/75">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" strokeWidth={1.8} />
              {formatCount(template.useCount)} ranked
            </span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" strokeWidth={1.8} />
              {formatCount(template.viewCount)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.8} />
              {formatTimeToRank(template.itemCount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Link>
)
