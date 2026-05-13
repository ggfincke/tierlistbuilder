// convex/marketplace/rankings/seedCuratedResolver.ts
// resolve curated ranking labels against a template's items, validate tier
// shape, & return RankedSeedItem rows ready for insertSeedRanking.

import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { normalizeBucketLabel } from '@tierlistbuilder/contracts/marketplace/ranking'
import { assertCountRange } from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import { validateTemplateTiers } from '../templates/lib'
import { normalizeSeedTextKey, type RankedSeedItem } from './seedScoring'
import type { SeedCuratedRanking } from './seedValidators'

const buildItemLookupByLabel = (
  items: readonly Doc<'templateItems'>[],
  path: string
): Map<string, Doc<'templateItems'>> =>
{
  const map = new Map<string, Doc<'templateItems'>>()
  for (const item of items)
  {
    const label = item.label ?? item.externalId
    const key = normalizeSeedTextKey(label)
    if (map.has(key))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: duplicate normalized template label '${key}'`,
      })
    }
    map.set(key, item)
  }
  return map
}

const requireCuratedItemByLabel = (
  curated: SeedCuratedRanking,
  lookup: ReadonlyMap<string, Doc<'templateItems'>>,
  label: string
): Doc<'templateItems'> =>
{
  const match = lookup.get(normalizeSeedTextKey(label))
  if (match) return match
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `curated ranking ${curated.externalId}: no template item with label '${label}'`,
  })
}

const indexCuratedTiers = (
  curated: SeedCuratedRanking,
  path: string
): Map<string, number> =>
{
  const tiersByName = new Map<string, number>()
  curated.tiers.forEach((tier, index) =>
  {
    const key = normalizeBucketLabel(tier.name)
    if (!key || tiersByName.has(key))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: duplicate or blank curated tier '${tier.name}'`,
      })
    }
    tiersByName.set(key, index)
  })
  return tiersByName
}

const placeCuratedLabelsIntoTiers = (
  curated: SeedCuratedRanking,
  tiersByName: ReadonlyMap<string, number>,
  itemLookup: ReadonlyMap<string, Doc<'templateItems'>>,
  path: string
): {
  tierIndexByItemId: Map<Id<'templateItems'>, number>
  labelsByTier: Map<number, string[]>
} =>
{
  const tierIndexByItemId = new Map<Id<'templateItems'>, number>()
  const labelsByTier = new Map<number, string[]>()
  for (const group of curated.tierGroups)
  {
    const tierIndex = tiersByName.get(normalizeBucketLabel(group.tierName))
    if (tierIndex === undefined)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: unknown curated tier '${group.tierName}'`,
      })
    }
    const list = labelsByTier.get(tierIndex) ?? []
    for (const label of group.labels)
    {
      const item = requireCuratedItemByLabel(curated, itemLookup, label)
      if (tierIndexByItemId.has(item._id))
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: `${path}: template item '${label}' is placed more than once`,
        })
      }
      tierIndexByItemId.set(item._id, tierIndex)
      list.push(label)
    }
    labelsByTier.set(tierIndex, list)
  }
  return { tierIndexByItemId, labelsByTier }
}

const skippedItemIdsFromParents = (
  curated: SeedCuratedRanking,
  itemLookup: ReadonlyMap<string, Doc<'templateItems'>>,
  tierIndexByItemId: ReadonlyMap<Id<'templateItems'>, number>,
  path: string
): Set<Id<'templateItems'>> =>
{
  const skipped = new Set<Id<'templateItems'>>()
  for (const [childLabel, parentLabel] of Object.entries(
    curated.parentLabelByLabel ?? {}
  ))
  {
    const parent = requireCuratedItemByLabel(curated, itemLookup, parentLabel)
    if (!tierIndexByItemId.has(parent._id))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: parent label '${parentLabel}' missing for child '${childLabel}'`,
      })
    }
    skipped.add(requireCuratedItemByLabel(curated, itemLookup, childLabel)._id)
  }
  return skipped
}

const assertFullTemplateCoverage = (
  curated: SeedCuratedRanking,
  items: readonly Doc<'templateItems'>[],
  tierIndexByItemId: ReadonlyMap<Id<'templateItems'>, number>,
  skippedItemIds: ReadonlySet<Id<'templateItems'>>,
  path: string
): void =>
{
  if (curated.coverage !== 'full-template') return
  for (const item of items)
  {
    if (tierIndexByItemId.has(item._id) || skippedItemIds.has(item._id))
    {
      continue
    }
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `${path}: template item '${item.label ?? item.externalId}' is not placed`,
    })
  }
}

export const mapItemsToCuratedTiers = (
  curated: SeedCuratedRanking,
  items: readonly Doc<'templateItems'>[],
  path = curated.externalId
): RankedSeedItem[] =>
{
  assertCountRange(
    'curated tiers',
    curated.tiers.length,
    1,
    SEED_LIMITS.rankingSeedTiersPerRanking
  )
  validateTemplateTiers(curated.tiers)

  const tiersByName = indexCuratedTiers(curated, path)
  const itemLookup = buildItemLookupByLabel(items, path)
  const { tierIndexByItemId, labelsByTier } = placeCuratedLabelsIntoTiers(
    curated,
    tiersByName,
    itemLookup,
    path
  )
  const skippedItemIds = skippedItemIdsFromParents(
    curated,
    itemLookup,
    tierIndexByItemId,
    path
  )
  assertFullTemplateCoverage(
    curated,
    items,
    tierIndexByItemId,
    skippedItemIds,
    path
  )

  const ranked: RankedSeedItem[] = []
  const tierIndices = [...labelsByTier.keys()].sort((a, b) => a - b)
  for (const tierIndex of tierIndices)
  {
    const labels = labelsByTier.get(tierIndex) ?? []
    let orderInTier = 0
    for (const label of labels)
    {
      const item = requireCuratedItemByLabel(curated, itemLookup, label)
      ranked.push({
        item,
        tierIndex,
        orderInTier: orderInTier++,
        globalOrder: ranked.length,
      })
    }
  }
  return ranked
}
