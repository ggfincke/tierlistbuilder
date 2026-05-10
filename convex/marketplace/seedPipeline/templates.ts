// convex/marketplace/seedPipeline/templates.ts
// template-lifecycle helpers: read/normalize/publish/rollback templates &
// their items for a seed release

import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type {
  SeedTemplateCriterionKey,
  SeedTemplateItemKey,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { MAX_TEMPLATE_COVER_ITEMS } from '@tierlistbuilder/contracts/marketplace/template'
import {
  assertCountRange,
  assertNonemptyString,
  assertPositiveFinite,
  assertPositiveInteger,
} from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import {
  adjustPublicTemplateCount,
  buildTemplateStateFields,
  markTemplateNotPublic,
  normalizeDescription,
  normalizeTags,
  normalizeTemplateTitle,
  patchTemplateAndSyncCard,
  syncTemplateTagRows,
  validateTemplateTiers,
} from '../templates/lib'
import { valuesEqual } from '../../lib/equality'
import { resolveSeedMediaAssetIdFromCache } from './media'
import type { SeedTemplateApplyPatch, SeedTemplateUpsertArg } from './types'

export const toSeedItemKey = (item: {
  templateExternalId: string
  itemExternalId: string
}): SeedTemplateItemKey => ({
  templateExternalId: item.templateExternalId,
  itemExternalId: item.itemExternalId,
})

export const toSeedCriterionKey = (criterion: {
  templateExternalId: string
  criterionExternalId: string
}): SeedTemplateCriterionKey => ({
  templateExternalId: criterion.templateExternalId,
  criterionExternalId: criterion.criterionExternalId,
})

export const groupByTemplateExternalId = <
  T extends { templateExternalId: string },
>(
  rows: readonly T[]
): Map<string, T[]> =>
{
  const groups = new Map<string, T[]>()
  for (const row of rows)
  {
    const group = groups.get(row.templateExternalId) ?? []
    group.push(row)
    groups.set(row.templateExternalId, group)
  }
  return groups
}

export const buildSeedTemplateCoverItems = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templates'>['coverItems']> =>
{
  const items = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(MAX_TEMPLATE_COVER_ITEMS)
  return items
    .filter(
      (item): item is typeof item & { mediaAssetId: Id<'mediaAssets'> } =>
        item.mediaAssetId !== null
    )
    .map((item) => ({
      mediaAssetId: item.mediaAssetId,
      label: item.label,
      backgroundColor: item.backgroundColor,
      aspectRatio: item.aspectRatio,
      imageFit: item.imageFit,
      transform: item.transform,
    }))
}

export const countSeedTemplateItems = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<number> =>
{
  const items = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(SEED_LIMITS.itemsPerTemplate + 1)
  if (items.length > SEED_LIMITS.itemsPerTemplate)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed template item count exceeds apply limit',
    })
  }
  return items.length
}

export const patchSeedTemplateItemSummary = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  const now = Date.now()
  const [itemCount, coverItems] = await Promise.all([
    countSeedTemplateItems(ctx, template._id),
    buildSeedTemplateCoverItems(ctx, template._id),
  ])
  await patchTemplateAndSyncCard(ctx, template, {
    itemCount,
    coverItems,
    ...buildTemplateStateFields(itemCount, template.visibility, 'unpublished'),
    seedReleaseStatus: 'applied_hidden',
    updatedAt: now,
  })
}

export const normalizeSeedTemplateUpsert = (
  datasetKey: string,
  releaseId: string,
  template: SeedTemplateUpsertArg,
  mediaAssetCache: ReadonlyMap<string, Id<'mediaAssets'>>
): SeedTemplateApplyPatch =>
{
  assertNonemptyString('templateExternalId', template.externalId)
  assertPositiveFinite('itemAspectRatio', template.itemAspectRatio)
  assertPositiveInteger('itemCount', template.itemCount)
  assertCountRange('suggestedTiers', template.suggestedTiers.length, 1, 16)
  validateTemplateTiers(template.suggestedTiers)
  const coverMediaAssetId = template.coverMediaContentHash
    ? resolveSeedMediaAssetIdFromCache(
        mediaAssetCache,
        template.coverMediaContentHash
      )
    : null
  return {
    title: normalizeTemplateTitle(template.title),
    description: normalizeDescription(template.description),
    category: template.category,
    tags: normalizeTags(template.tags),
    visibility: template.visibility,
    coverMediaAssetId,
    coverFraming: template.coverFraming,
    suggestedTiers: template.suggestedTiers,
    itemAspectRatio: template.itemAspectRatio,
    itemAspectRatioMode: 'manual',
    defaultItemImageFit: 'cover',
    itemCount: template.itemCount,
    ...buildTemplateStateFields(
      template.itemCount,
      template.visibility,
      'unpublished'
    ),
    seedDatasetKey: datasetKey,
    seedExternalId: template.externalId,
    seedReleaseId: releaseId,
    seedReleaseStatus: 'applied_hidden',
  }
}

export const templatePatchChanged = (
  template: Doc<'templates'>,
  patch: Partial<Doc<'templates'>>
): boolean =>
  Object.entries(patch).some(
    ([key, value]) =>
      !valuesEqual(template[key as keyof Doc<'templates'>], value)
  )

export const loadSeedTemplatesForRelease = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'templates'>[]> =>
  await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(SEED_LIMITS.templatesPerDiff + 1)

export const assertSeedTemplateReadLimit = (
  templates: readonly Doc<'templates'>[],
  releaseId: string | null | undefined
): void =>
{
  if (templates.length <= SEED_LIMITS.templatesPerDiff) return
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `seed release exceeds template read limit: ${releaseId ?? 'unknown'}`,
  })
}

export const loadSeedTemplateLookupForRelease = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<{
  templates: Doc<'templates'>[]
  byExternalId: Map<string, Doc<'templates'>>
}> =>
{
  const templates = await loadSeedTemplatesForRelease(
    ctx,
    datasetKey,
    releaseId
  )
  assertSeedTemplateReadLimit(templates, releaseId)
  return {
    templates,
    byExternalId: new Map(
      templates
        .filter((row) => row.seedExternalId !== undefined)
        .map((row) => [row.seedExternalId as string, row])
    ),
  }
}

export const publishSeedReleaseTemplates = async (
  ctx: MutationCtx,
  templates: readonly Doc<'templates'>[],
  now: number
): Promise<void> =>
{
  assertSeedTemplateReadLimit(templates, templates[0]?.seedReleaseId)
  const deltas: { category: Doc<'templates'>['category']; delta: number }[] = []
  for (const template of templates)
  {
    const state = buildTemplateStateFields(
      template.itemCount,
      template.visibility,
      'published'
    )
    if (!template.isPubliclyListable && state.isPubliclyListable)
    {
      deltas.push({ category: template.category, delta: 1 })
    }
    const next = await patchTemplateAndSyncCard(ctx, template, {
      ...state,
      seedReleaseStatus: 'active',
      updatedAt: now,
    })
    await syncTemplateTagRows(ctx, next)
  }
  await adjustPublicTemplateCount(ctx, deltas)
}

export const rollBackSeedReleaseTemplates = async (
  ctx: MutationCtx,
  templates: readonly Doc<'templates'>[],
  now: number
): Promise<void> =>
{
  assertSeedTemplateReadLimit(templates, templates[0]?.seedReleaseId)
  for (const template of templates)
  {
    const next = await markTemplateNotPublic(
      ctx,
      template,
      now,
      'unpublished',
      { clearSourceBoard: false }
    )
    await patchTemplateAndSyncCard(ctx, next, {
      seedReleaseStatus: 'rolled_back',
      updatedAt: now,
    })
  }
}
