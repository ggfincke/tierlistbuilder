// src/features/marketplace/model/templateStatMeta.ts
// the shared four-signal stat set every template surface renders — keeps the
// gallery card, hero, & detail hero showing the same metrics in scan order

import { BarChart3, Eye, GitFork, LayoutGrid } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

// keys index the denormalized counts on a marketplace template summary; every
// one resolves to a number, so a surface reads template[stat.key] directly
export interface TemplateStatMeta
{
  key: 'itemCount' | 'rankingCount' | 'forkCount' | 'viewCount'
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

// scan order — what you'd rank, how much consensus exists, then the lighter
// forks & views engagement counts
export const TEMPLATE_STAT_META: readonly TemplateStatMeta[] = [
  { key: 'itemCount', label: 'items', icon: LayoutGrid },
  { key: 'rankingCount', label: 'rankings', icon: BarChart3 },
  { key: 'forkCount', label: 'forks', icon: GitFork },
  { key: 'viewCount', label: 'views', icon: Eye },
]
