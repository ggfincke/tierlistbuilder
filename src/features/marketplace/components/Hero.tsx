// src/features/marketplace/components/Hero.tsx
// large featured-template tile rendered at the top of the gallery — large
// cover w/ overlaid copy & a "Use this template" CTA

import { ArrowRight, Clock, Eye, Layers, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { MarketplaceTemplateSummary } from '@tierlistbuilder/contracts/marketplace/template'

import {
  formatCount,
  formatTimeToRank,
} from '~/features/marketplace/model/formatters'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { Cover } from './Cover'

interface HeroProps
{
  template: MarketplaceTemplateSummary
}

export const Hero = ({ template }: HeroProps) => (
  <Link
    to={`${TEMPLATES_ROUTE_PATH}/${template.slug}`}
    className="group focus-custom relative block h-[26rem] overflow-hidden rounded-2xl border border-[var(--t-border)] transition hover:border-[var(--t-border-hover)] hover:shadow-2xl focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
    aria-label={`Featured: ${template.title}`}
  >
    <Cover template={template} density="hero" />

    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-black/10 to-black/85 p-7 text-white">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-black uppercase backdrop-blur">
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          Editor's pick
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur">
          {CATEGORY_META[template.category].label}
        </span>
      </div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight">
        {template.title}
      </h2>
      {template.description && (
        <p className="mt-2 max-w-xl text-sm text-white/85 line-clamp-2">
          {template.description}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-[13px] font-semibold text-black transition group-hover:bg-white/90">
          Open template
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="flex items-center gap-3.5 text-xs text-white/75">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(template.useCount)} forked
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
  </Link>
)
