// src/app/shells/top-nav/topNavItems.ts
// route pill defs for workspace, boards, & templates
// My Boards follows the Bundle A glossary decision.

import { Bookmark, Layers, Sparkles, type LucideIcon } from 'lucide-react'

import {
  BOARDS_ROUTE_PATH,
  TEMPLATES_ROUTE_PATH,
} from '~/shared/routes/pathname'

export interface TopNavItem
{
  id: 'workspace' | 'boards' | 'templates'
  label: string
  to: string
  icon: LucideIcon
  end: boolean
}

export const TOP_NAV_ITEMS: readonly TopNavItem[] = [
  { id: 'workspace', label: 'Workspace', to: '/', icon: Layers, end: true },
  {
    id: 'boards',
    label: 'My Boards',
    to: BOARDS_ROUTE_PATH,
    icon: Bookmark,
    end: false,
  },
  {
    id: 'templates',
    label: 'Templates',
    to: TEMPLATES_ROUTE_PATH,
    icon: Sparkles,
    end: false,
  },
]
