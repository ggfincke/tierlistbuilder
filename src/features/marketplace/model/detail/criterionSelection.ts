// src/features/marketplace/model/detail/criterionSelection.ts
// pure helpers for picking criteria across consensus surfaces

import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'

export interface CompareCriterionSelection
{
  left: MarketplaceTemplateCriterion
  right: MarketplaceTemplateCriterion
  isSwapped: boolean
}

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
  let first: MarketplaceTemplateCriterion | null = null
  for (const criterion of criteria)
  {
    if (criterion.status !== 'active') continue
    if (!first || criterion.order < first.order)
    {
      first = criterion
    }
  }
  return first
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
  let best: MarketplaceTemplateCriterion | null = null
  let bestCount = -Infinity
  for (const criterion of criteria)
  {
    if (criterion.status !== 'active') continue
    if (criterion.externalId === excludedExternalId) continue

    const count = counts[criterion.externalId] ?? 0
    if (
      !best ||
      count > bestCount ||
      (count === bestCount && criterion.order < best.order)
    )
    {
      best = criterion
      bestCount = count
    }
  }
  return best
}

export const resolveCompareCriterionSelection = (
  template: MarketplaceTemplateDetail,
  activeCriteria: readonly MarketplaceTemplateCriterion[],
  leftParam: string | null,
  rightParam: string | null
): CompareCriterionSelection | null =>
{
  if (activeCriteria.length < 2) return null
  const sorted = [...activeCriteria].sort((a, b) => a.order - b.order)
  const primary = findPrimaryCriterion(activeCriteria) ?? sorted[0]!
  const left = findActiveCriterion(activeCriteria, leftParam) ?? primary

  // URL value wins; invalid/equal right side falls back to busiest other lane
  let right = findActiveCriterion(activeCriteria, rightParam)
  if (!right || right.externalId === left.externalId)
  {
    const counts = template.rankingCountByCriterion ?? {}
    right = selectBusiestOtherCriterion(sorted, left.externalId, counts)
  }
  if (!right) return null
  return {
    left,
    right,
    isSwapped: leftParam === right.externalId && rightParam === left.externalId,
  }
}
