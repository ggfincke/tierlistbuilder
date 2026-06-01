// convex/marketplace/seed/lib/resolvers.ts
// read-only resolvers backing the resolveSeedState query: load templates,
// items, criteria, & media for an author + manifest scope

import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type {
  SeedResolvedCriterion,
  SeedResolvedItem,
  SeedResolvedMedia,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { SEED_LIMITS } from '../../../lib/limits'
import { loadOwnedSeedMediaVariantLookup } from './mediaLookup'
import { loadSeedTemplateLookupForRelease } from './templates'
import type { SeedResolvedTemplateRow } from './types'

export const toResolvedTemplate = (
  template: Doc<'templates'>
): SeedResolvedTemplateRow => ({
  externalId: template.seedExternalId ?? '',
  releaseId: template.seedReleaseId ?? null,
  title: template.title,
  description: template.description,
  category: template.category,
  tags: template.tags,
  visibility: template.visibility,
  status: template.seedReleaseStatus ?? null,
  itemAspectRatio: template.itemAspectRatio ?? null,
  metadataContentHash: template.seedMetadataContentHash ?? null,
  itemsContentHash: template.seedItemsContentHash ?? null,
  criteriaContentHash: template.seedCriteriaContentHash ?? null,
})

export const resolveTemplates = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string,
  externalIds: readonly string[]
): Promise<Map<string, Doc<'templates'>>> =>
{
  if (externalIds.length === 0) return new Map()
  const requested = new Set(externalIds)
  const { byExternalId } = await loadSeedTemplateLookupForRelease(
    ctx,
    datasetKey,
    releaseId
  )
  const map = new Map<string, Doc<'templates'>>()
  for (const [externalId, template] of byExternalId)
  {
    if (requested.has(externalId)) map.set(externalId, template)
  }
  return map
}

export const resolveItems = async (
  ctx: QueryCtx,
  templates: ReadonlyMap<string, Doc<'templates'>>,
  keys: readonly { templateExternalId: string; itemExternalId: string }[]
): Promise<SeedResolvedItem[]> =>
{
  if (keys.length === 0) return []
  // group requested keys by template so we can fetch each template's items in
  // a single byTemplate scan, then resolve via an in-memory map. avoids N
  // separate byTemplateAndExternalId.unique() calls for large diffs
  const wantedByTemplate = new Map<string, Set<string>>()
  for (const key of keys)
  {
    if (!templates.has(key.templateExternalId)) continue
    const set =
      wantedByTemplate.get(key.templateExternalId) ?? new Set<string>()
    set.add(key.itemExternalId)
    wantedByTemplate.set(key.templateExternalId, set)
  }
  const itemMaps = await Promise.all(
    Array.from(
      wantedByTemplate.entries(),
      async ([templateExternalId, set]) =>
      {
        const template = templates.get(templateExternalId)
        if (!template)
          return [
            templateExternalId,
            new Map<string, Doc<'templateItems'>>(),
          ] as const
        const rows = await ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .take(SEED_LIMITS.itemsPerTemplate)
        const filtered = new Map<string, Doc<'templateItems'>>()
        for (const item of rows)
        {
          if (set.has(item.externalId)) filtered.set(item.externalId, item)
        }
        return [templateExternalId, filtered] as const
      }
    )
  )
  const byTemplate = new Map(itemMaps)
  const mediaAssetIds = Array.from(
    new Set(
      itemMaps.flatMap(([, items]) =>
        Array.from(items.values())
          .map((item) => item.mediaAssetId)
          .filter((id): id is Id<'mediaAssets'> => id !== null)
      )
    )
  )
  const mediaAssets = await Promise.all(
    mediaAssetIds.map((id) => ctx.db.get(id))
  )
  const mediaById = new Map(
    mediaAssets
      .filter((asset): asset is Doc<'mediaAssets'> => asset !== null)
      .map((asset) => [asset._id as string, asset])
  )
  const resolved: SeedResolvedItem[] = []
  for (const key of keys)
  {
    const item = byTemplate.get(key.templateExternalId)?.get(key.itemExternalId)
    if (!item) continue
    const media = item.mediaAssetId
      ? mediaById.get(item.mediaAssetId as string)
      : null
    resolved.push({
      templateExternalId: key.templateExternalId,
      itemExternalId: key.itemExternalId,
      order: item.order,
      label: item.label,
      mediaAssetId: item.mediaAssetId as string | null,
      mediaContentHash: media?.tileVariant.contentHash ?? null,
      mediaDedupeHash: media?.dedupeHash ?? null,
      aspectRatio: item.aspectRatio,
      transform: item.transform ?? null,
      mediaPlate: item.mediaPlate ?? null,
      imagePadding: item.imagePadding ?? null,
      backgroundColor: item.backgroundColor ?? null,
    })
  }
  return resolved
}

export const resolveCriteria = (
  templates: ReadonlyMap<string, Doc<'templates'>>,
  keys: readonly { templateExternalId: string; criterionExternalId: string }[]
): SeedResolvedCriterion[] =>
{
  const resolved: SeedResolvedCriterion[] = []
  for (const key of keys)
  {
    const template = templates.get(key.templateExternalId)
    const criterion = template?.criteria.find(
      (item) => item.externalId === key.criterionExternalId
    )
    if (!template || !criterion) continue
    resolved.push({
      templateExternalId: key.templateExternalId,
      criterionExternalId: key.criterionExternalId,
      name: criterion.name,
      shortName: criterion.shortName ?? null,
      prompt: criterion.prompt,
      axisTop: criterion.axisTop ?? null,
      axisBottom: criterion.axisBottom ?? null,
      order: criterion.order,
      isPrimary: criterion.isPrimary,
      status: criterion.status,
    })
  }
  return resolved
}

export const resolveMediaForAuthor = async (
  ctx: QueryCtx,
  authorId: Id<'users'> | null,
  variantHashes: readonly string[]
): Promise<SeedResolvedMedia[]> =>
{
  if (!authorId || variantHashes.length === 0) return []
  const { variantSets, assetById } = await loadOwnedSeedMediaVariantLookup(
    ctx,
    authorId,
    Array.from(new Set(variantHashes))
  )
  const seen = new Set<string>()
  const resolved: SeedResolvedMedia[] = []
  for (const [contentHash, variants] of variantSets)
  {
    for (const variant of variants)
    {
      const asset = assetById.get(variant.mediaAssetId as string)
      if (!asset) continue
      const key = `${contentHash}:${asset._id}:${variant.kind}`
      if (seen.has(key)) continue
      seen.add(key)
      resolved.push({
        contentHash,
        mediaAssetId: asset._id as string,
        mediaDedupeHash: asset.dedupeHash,
        variantKind: variant.kind,
        byteSize: variant.byteSize,
      })
    }
  }
  return resolved
}

export const resolveActiveSeedRuns = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string
): Promise<Doc<'seedRuns'>[]> =>
  await ctx.db
    .query('seedRuns')
    .withIndex('byDatasetStatus', (q) =>
      q.eq('datasetKey', datasetKey).eq('status', 'active')
    )
    .order('desc')
    .take(SEED_LIMITS.activeRunsPerDataset)

export const resolveActiveReleaseIds = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string
): Promise<string[]> =>
{
  const activeRuns = await resolveActiveSeedRuns(ctx, datasetKey)
  return Array.from(new Set(activeRuns.map((run) => run.releaseId)))
}
