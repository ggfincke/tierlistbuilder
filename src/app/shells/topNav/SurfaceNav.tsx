// src/app/shells/topNav/SurfaceNav.tsx
// public surface route pills for the global app chrome

import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { TOP_NAV_ITEMS, type TopNavItem } from './topNavItems'

interface SurfaceNavProps
{
  children: ReactNode
}

export const SurfaceNav = ({ children }: SurfaceNavProps) => (
  <nav
    aria-label="Surfaces"
    className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/65 p-1 backdrop-blur sm:gap-1.5"
  >
    {TOP_NAV_ITEMS.map((item) => (
      <SurfacePill key={item.id} item={item} />
    ))}
    <span
      aria-hidden="true"
      className="mx-0.5 h-5 w-px bg-[var(--t-border)] sm:mx-1"
    />
    {children}
  </nav>
)

const SurfacePill = ({ item }: { item: TopNavItem }) => (
  <NavLink
    to={item.to}
    end={item.end}
    aria-label={item.label}
    className={({ isActive }) =>
      [
        'focus-custom inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:px-3',
        isActive
          ? 'bg-[var(--t-text)] text-[var(--t-bg-page)] shadow-sm'
          : 'text-[var(--t-text-muted)] hover:text-[var(--t-text)]',
      ].join(' ')
    }
  >
    <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
    <span className="hidden sm:inline">{item.label}</span>
  </NavLink>
)
