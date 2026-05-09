// src/features/marketplace/model/criterionSelection.ts
// pure helpers for picking criteria across consensus surfaces — kept out
// of the hook module so non-React callers don't import a hook file

import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'

// busiest active criterion other than the excluded one. ties broken by
// `order` so chip placement & default-right selection stay deterministic
export const selectBusiestOtherCriterion = (
  criteria: readonly MarketplaceTemplateCriterion[],
  excludedExternalId: string,
  counts: Record<string, number> = {}
): MarketplaceTemplateCriterion | null =>
{
  const others = criteria
    .filter(
      (criterion) =>
        criterion.status === 'active' &&
        criterion.externalId !== excludedExternalId
    )
    .sort(
      (a, b) =>
        (counts[b.externalId] ?? 0) - (counts[a.externalId] ?? 0) ||
        a.order - b.order
    )
  return others[0] ?? null
}
