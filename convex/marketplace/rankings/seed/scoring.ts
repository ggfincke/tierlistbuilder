// convex/marketplace/rankings/seed/scoring.ts
// deterministic per-profile ranking score & tier-quota math.

// FNV-1a is sync (sha256 is async via Web Crypto); scoring runs item-by-item,
// so a Promise per score would cascade async through the entire pipeline.

import type { Doc } from '../../../_generated/dataModel'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { DEFAULT_TEMPLATE_TIERS } from '../../templates/lib'
import type { SeedRankingLane, SeedRankingProfile } from './validators'

export interface RankedSeedItem
{
  item: Doc<'templateItems'>
  tierIndex: number
  orderInTier: number
  globalOrder: number
}

const fnv1aHash = (value: string): number =>
{
  let hash = 2166136261
  for (let i = 0; i < value.length; i++)
  {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const unitHash = (value: string): number => fnv1aHash(value) / 0xffffffff

export const seedUnitHash = (value: string): number => unitHash(value)

const normalizeTextKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

export const normalizeSeedTextKey = (value: string): string =>
  normalizeTextKey(value)

const termMatches = (label: string, terms: readonly string[]): number =>
{
  const normalized = normalizeTextKey(label)
  return terms.reduce((sum, term) =>
  {
    const needle = normalizeTextKey(term)
    return needle && normalized.includes(needle) ? sum + 1 : sum
  }, 0)
}

const profileTargetTerms = (
  profile: SeedRankingProfile,
  field: 'boostTermsByTarget' | 'dropTermsByTarget',
  templateExternalId: string
): readonly string[] => profile[field]?.[templateExternalId] ?? []

const laneProfileTerms = (
  lane: SeedRankingLane,
  field: 'profileBoostOverrides' | 'profileDropOverrides',
  profileKey: string
): readonly string[] => lane[field]?.[profileKey] ?? []

export const scoreLaneItem = (
  templateExternalId: string,
  lane: SeedRankingLane,
  profile: SeedRankingProfile,
  item: Doc<'templateItems'>
): number =>
{
  const label = item.label ?? item.externalId
  const crowd = unitHash(
    `crowd:${templateExternalId}:${lane.criterionExternalId}:${label}`
  )
  const personal = unitHash(
    `personal:${profile.key}:${templateExternalId}:${lane.criterionExternalId}:${label}`
  )
  const chaos = Math.min(1, profile.chaos * (lane.chaosMultiplier ?? 1))
  const contrarian = Math.min(
    1,
    profile.contrarian * (lane.contrarianMultiplier ?? 1)
  )
  const baseCrowd = crowd * (1 - contrarian)
  const baseContrarian = (1 - crowd) * contrarian
  let score = (baseCrowd + baseContrarian) * (1 - chaos)
  score += personal * chaos
  score += termMatches(label, lane.boostTerms) * 0.18
  score -= termMatches(label, lane.dropTerms) * 0.24
  score +=
    termMatches(
      label,
      profileTargetTerms(profile, 'boostTermsByTarget', templateExternalId)
    ) * 0.25
  score -=
    termMatches(
      label,
      profileTargetTerms(profile, 'dropTermsByTarget', templateExternalId)
    ) * 0.25
  score +=
    termMatches(
      label,
      laneProfileTerms(lane, 'profileBoostOverrides', profile.key)
    ) * 0.5
  score -=
    termMatches(
      label,
      laneProfileTerms(lane, 'profileDropOverrides', profile.key)
    ) * 0.3
  return score
}

const tierWeights = (tierCount: number): number[] =>
{
  if (tierCount === 6) return [0.14, 0.19, 0.22, 0.2, 0.15, 0.1]
  return Array.from({ length: tierCount }, () => 1 / tierCount)
}

export const resolveTierQuotas = (
  itemCount: number,
  tierCount: number
): number[] =>
{
  const weights = tierWeights(tierCount)
  const minQuota = itemCount >= tierCount ? 1 : 0
  const raw = weights.map((weight) => weight * itemCount)
  const quotas = raw.map((quota) => Math.max(minQuota, Math.floor(quota)))
  let sum = quotas.reduce((total, quota) => total + quota, 0)

  for (let i = quotas.length - 1; sum > itemCount && i >= 0; i--)
  {
    while (sum > itemCount && quotas[i] > minQuota)
    {
      quotas[i] -= 1
      sum -= 1
    }
  }

  while (sum < itemCount)
  {
    let bestIndex = 0
    let bestGap = -Infinity
    for (let i = 0; i < quotas.length; i++)
    {
      const gap = raw[i] - quotas[i]
      if (gap > bestGap)
      {
        bestGap = gap
        bestIndex = i
      }
    }
    quotas[bestIndex] += 1
    sum += 1
  }

  return quotas
}

export const rankTemplateItemsWithScore = (
  items: readonly Doc<'templateItems'>[],
  tiers: readonly TierPresetTier[],
  scoreItem: (item: Doc<'templateItems'>) => number
): RankedSeedItem[] =>
{
  const scored = items
    .map((item) => ({ item, score: scoreItem(item) }))
    .sort((a, b) => b.score - a.score || a.item.order - b.item.order)
  const quotas = resolveTierQuotas(items.length, tiers.length)
  const ranked: RankedSeedItem[] = []
  let cursor = 0

  for (let tierIndex = 0; tierIndex < quotas.length; tierIndex++)
  {
    for (let orderInTier = 0; orderInTier < quotas[tierIndex]; orderInTier++)
    {
      const entry = scored[cursor]
      if (!entry) break
      ranked.push({
        item: entry.item,
        tierIndex,
        orderInTier,
        globalOrder: ranked.length,
      })
      cursor += 1
    }
  }

  return ranked
}

export const resolveTemplateTiers = (
  template: Doc<'templates'>
): readonly TierPresetTier[] =>
  template.suggestedTiers.length > 0
    ? template.suggestedTiers
    : DEFAULT_TEMPLATE_TIERS

export const featuredForProfile = (
  lane: SeedRankingLane,
  profileKey: string
): {
  featuredRank: number
  featuredBadge: NonNullable<
    SeedRankingLane['featuredProfiles']
  >[number]['featuredBadge']
} | null =>
{
  const match = lane.featuredProfiles?.find(
    (profile) => profile.profileKey === profileKey
  )
  if (!match) return null
  return {
    featuredRank: match.featuredRank,
    featuredBadge: match.featuredBadge,
  }
}
