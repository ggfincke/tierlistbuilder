// src/features/marketplace/ui/layout/MarketplaceNotFound.tsx
// centered not-found surface for marketplace detail routes

import { NotFoundSurface } from '~/shared/ui/NotFoundSurface'

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
  <NotFoundSurface
    title={title}
    body={body}
    actionLabel={actionLabel}
    to={to}
  />
)
