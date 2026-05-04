// src/app/shells/topNav/topNavItems.ts
// route pill definitions for global app chrome

import { Layers, type LucideIcon } from 'lucide-react'

export interface TopNavItem
{
  id: 'workspace'
  label: string
  to: string
  icon: LucideIcon
  end: boolean
}

export const TOP_NAV_ITEMS: readonly TopNavItem[] = [
  { id: 'workspace', label: 'Workspace', to: '/', icon: Layers, end: true },
]
