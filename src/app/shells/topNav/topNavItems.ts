// src/app/shells/topNav/topNavItems.ts
// route pill definitions for global app chrome

import { Layers, Library, type LucideIcon } from 'lucide-react'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

export interface TopNavItem
{
  id: 'workspace' | 'templates'
  label: string
  to: string
  icon: LucideIcon
  end: boolean
}

export const TOP_NAV_ITEMS: readonly TopNavItem[] = [
  { id: 'workspace', label: 'Workspace', to: '/', icon: Layers, end: true },
  {
    id: 'templates',
    label: 'Templates',
    to: TEMPLATES_ROUTE_PATH,
    icon: Library,
    end: false,
  },
]
