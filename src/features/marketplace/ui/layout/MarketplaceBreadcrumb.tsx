// src/features/marketplace/ui/layout/MarketplaceBreadcrumb.tsx
// compact breadcrumb row for marketplace detail pages

import { Link } from 'react-router-dom'

interface MarketplaceBreadcrumbItem
{
  label: string
  to?: string
}

interface MarketplaceBreadcrumbProps
{
  items: readonly MarketplaceBreadcrumbItem[]
}

export const MarketplaceBreadcrumb = ({
  items,
}: MarketplaceBreadcrumbProps) => (
  <nav
    aria-label="Breadcrumb"
    className="flex items-center gap-1.5 text-xs text-[var(--t-text-muted)]"
  >
    {items.map((item, index) => (
      <span key={`${item.label}-${index}`} className="contents">
        {index > 0 && (
          <span aria-hidden="true" className="opacity-40">
            /
          </span>
        )}
        {item.to ? (
          <Link
            to={item.to}
            className="focus-custom truncate rounded transition hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            {item.label}
          </Link>
        ) : (
          <span className="truncate text-[var(--t-text-secondary)]">
            {item.label}
          </span>
        )}
      </span>
    ))}
  </nav>
)
