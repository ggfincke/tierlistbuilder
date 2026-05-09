// src/features/marketplace/model/criterionSelection.ts
// pure helpers for picking criteria across consensus surfaces — kept out
// of the hook module so non-React callers don't import a hook file

import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'

export const findActiveCriterion = (
  criteria: readonly MarketplaceTemplateCriterion[],
  externalId: string | null | undefined
): MarketplaceTemplateCriterion | null =>
{
  if (!externalId) return null
  const match = criteria.find(
    (criterion) => criterion.externalId === externalId
  )
  return match?.status === 'active' ? match : null
}

export const findPrimaryCriterion = (
  criteria: readonly MarketplaceTemplateCriterion[]
): MarketplaceTemplateCriterion | null =>
  criteria.find(
    (criterion) => criterion.isPrimary && criterion.status === 'active'
  ) ?? null

export const findFirstActiveCriterion = (
  criteria: readonly MarketplaceTemplateCriterion[]
): MarketplaceTemplateCriterion | null =>
{
  const sorted = [...criteria]
    .filter((criterion) => criterion.status === 'active')
    .sort((a, b) => a.order - b.order)
  return sorted[0] ?? null
}

export const pickInitialCriterionExternalId = (
  criteria: readonly MarketplaceTemplateCriterion[],
  preferredExternalId: string | null | undefined
): string | null =>
  findActiveCriterion(criteria, preferredExternalId)?.externalId ??
  findPrimaryCriterion(criteria)?.externalId ??
  criteria[0]?.externalId ??
  null

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
