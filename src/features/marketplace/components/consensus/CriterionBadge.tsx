// src/features/marketplace/components/consensus/CriterionBadge.tsx
// labels which criterion a ranking answers; hidden for the default lane
// so single-criterion templates don't grow a redundant "Overall" chip

import { Tag } from 'lucide-react'

import {
  DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
  type MarketplaceTemplateCriterionSnapshot,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'

interface CriterionBadgeProps
{
  criterion: MarketplaceTemplateCriterionSnapshot
  // visual variant: 'pill' for hero/header surfaces (matches existing
  // category chip), 'inline' for tight rows where a leading dot suffices
  variant?: 'pill' | 'inline'
  // when true, render the badge even if the criterion is the implicit
  // default. used for surfaces that need a consistent slot height (eg
  // a divergence table row) but rare in practice
  showDefault?: boolean
}

const isDefaultCriterion = (
  criterion: MarketplaceTemplateCriterionSnapshot
): boolean => criterion.externalId === DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID

export const CriterionBadge = ({
  criterion,
  variant = 'pill',
  showDefault = false,
}: CriterionBadgeProps) =>
{
  if (!showDefault && isDefaultCriterion(criterion)) return null
  if (variant === 'inline')
  {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--t-text-secondary)]">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--t-accent)]/70"
        />
        {criterion.name}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--t-text-secondary)]"
      title={criterion.prompt}
    >
      <Tag className="h-2.5 w-2.5" strokeWidth={2} />
      {criterion.name}
    </span>
  )
}
