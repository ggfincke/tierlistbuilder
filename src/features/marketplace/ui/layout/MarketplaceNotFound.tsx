// src/features/marketplace/ui/layout/MarketplaceNotFound.tsx
// centered not-found surface for marketplace detail routes

import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PAGE_SHELL } from '~/shared/ui/pageContainer'

interface MarketplaceNotFoundProps
{
  title: string
  body: string
  actionLabel: string
  to: string
}

export const MarketplaceNotFound = ({
  title,
  body,
  actionLabel,
  to,
}: MarketplaceNotFoundProps) => (
  <section
    className={`${PAGE_SHELL} flex min-h-[60vh] items-center justify-center pt-20 text-center sm:pt-24`}
  >
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold text-[var(--t-text)]">{title}</h1>
      <p className="mt-2 text-sm text-[var(--t-text-muted)]">{body}</p>
      <Link
        to={to}
        className="focus-custom mt-5 inline-flex items-center gap-1.5 rounded-md bg-[var(--t-accent)] px-4 py-2 text-sm font-semibold text-[var(--t-accent-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        {actionLabel}
      </Link>
    </div>
  </section>
)
