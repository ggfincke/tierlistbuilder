// src/app/shells/topNav/topNavItems.ts
// route pill defs — Workspace · My Boards · Templates. "My Boards" per
// Bundle A glossary decision (see dev-docs/phase-7c-design.md).

import { Bookmark, Layers, Sparkles, type LucideIcon } from 'lucide-react'

import { BOARDS_ROUTE_PATH, TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

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
