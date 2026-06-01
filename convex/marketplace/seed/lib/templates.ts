// convex/marketplace/seed/lib/templates.ts
// template-lifecycle helpers: read/normalize/publish/rollback templates &
// their items for a seed release

import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type {
  SeedTemplateCriterionKey,
  SeedTemplateItemKey,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { MAX_TEMPLATE_COVER_ITEMS } from '@tierlistbuilder/contracts/marketplace/template'
import {
  assertCountRange,
  assertFiniteRange,
  assertNonemptyString,
  assertPositiveFinite,
  assertPositiveInteger,
} from '../../../lib/assertions'
import { validateBoardAutoPlateUniformColor } from '../../../lib/validators/common'
import {
  IMAGE_PADDING_MAX,
  IMAGE_PADDING_MIN,
} from '@tierlistbuilder/contracts/workspace/board'
import { SEED_LIMITS } from '../../../lib/limits'
import {
  adjustPublicTemplateCount,
  patchTemplateAndSyncCard,
  patchTemplateTagRows,
  syncTemplateTagRows,
} from '../../templates/lib/writes'
import {
  buildTemplateStateFields,
  isPublicTemplateRow,
} from '../../templates/lib/state'
import {
  normalizeDescription,
  normalizeTags,
  normalizeTemplateTitle,
  validateTemplateTiers,
} from '../../templates/lib/normalize'
import { resolveSeedMediaAssetIdByDedupeHash } from './media'
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
      mediaPlate: item.mediaPlate ?? null,
      aspectRatio: item.aspectRatio,
      imageFit: item.imageFit,
      transform: item.transform,
      imagePadding: item.imagePadding ?? null,
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
  template: Doc<'templates'>,
  extraFields: Pick<Partial<Doc<'templates'>>, 'seedItemsContentHash'> = {}
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
    ...buildSeedTemplateLifecycleFields(
      itemCount,
      template.visibility,
      template.seedReleaseStatus === 'active'
    ),
    ...extraFields,
    updatedAt: now,
  })
}

export const buildSeedTemplateLifecycleFields = (
  itemCount: number,
  visibility: Doc<'templates'>['visibility'],
  isActiveRelease: boolean
): Pick<
  Doc<'templates'>,
  'isPubliclyListable' | 'publicationState' | 'seedReleaseStatus' | 'sizeClass'
> => ({
  ...buildTemplateStateFields(
    itemCount,
    visibility,
    isActiveRelease ? 'published' : 'unpublished'
  ),
  seedReleaseStatus: isActiveRelease ? 'active' : 'applied_hidden',
})

export const normalizeSeedTemplateUpsert = (
  datasetKey: string,
  releaseId: string,
  template: SeedTemplateUpsertArg,
  mediaAssetCache: ReadonlyMap<string, Id<'mediaAssets'>>,
  isActiveRelease: boolean
): SeedTemplateApplyPatch =>
{
  assertNonemptyString('templateExternalId', template.externalId)
  assertNonemptyString('metadataContentHash', template.metadataContentHash)
  assertPositiveFinite('itemAspectRatio', template.itemAspectRatio)
  if (template.defaultItemImagePadding !== null)
  {
    assertFiniteRange(
      'defaultItemImagePadding',
      template.defaultItemImagePadding,
      IMAGE_PADDING_MIN,
      IMAGE_PADDING_MAX
    )
  }
  assertPositiveInteger('itemCount', template.itemCount)
  assertCountRange('suggestedTiers', template.suggestedTiers.length, 1, 16)
  validateTemplateTiers(template.suggestedTiers)
  validateBoardAutoPlateUniformColor(template.autoPlate)
  const coverMediaAssetId = template.coverMediaDedupeHash
    ? resolveSeedMediaAssetIdByDedupeHash(
        mediaAssetCache,
        template.coverMediaDedupeHash
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
    defaultItemImagePadding: template.defaultItemImagePadding,
    itemCount: template.itemCount,
    labels: template.labels ?? null,
    autoPlate: template.autoPlate,
    ...buildSeedTemplateLifecycleFields(
      template.itemCount,
      template.visibility,
      isActiveRelease
    ),
    seedDatasetKey: datasetKey,
    seedExternalId: template.externalId,
    seedReleaseId: releaseId,
    seedMetadataContentHash: template.metadataContentHash,
  }
}

export const seedTemplateApplyGateChanged = (
  template: Doc<'templates'>,
  patch: SeedTemplateApplyPatch
): boolean =>
  template.seedMetadataContentHash !== patch.seedMetadataContentHash ||
  template.seedReleaseStatus !== patch.seedReleaseStatus ||
  template.isPubliclyListable !== patch.isPubliclyListable ||
  template.publicationState !== patch.publicationState ||
  template.sizeClass !== patch.sizeClass

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
  await Promise.all(
    templates.map(async (template) =>
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
    })
  )
  await adjustPublicTemplateCount(ctx, deltas)
}

export const rollBackSeedReleaseTemplates = async (
  ctx: MutationCtx,
  templates: readonly Doc<'templates'>[],
  now: number
): Promise<void> =>
{
  assertSeedTemplateReadLimit(templates, templates[0]?.seedReleaseId)
  // adjustPublicTemplateCount writes one shared marketplaceStats row.
  // Aggregate deltas before the single patch to avoid branch races.
  const deltas = templates
    .filter(isPublicTemplateRow)
    .map((template) => ({ category: template.category, delta: -1 }))
  await Promise.all(
    templates.map(async (template) =>
    {
      await patchTemplateAndSyncCard(ctx, template, {
        publicationState: 'unpublished',
        isPubliclyListable: false,
        seedReleaseStatus: 'rolled_back',
        updatedAt: now,
      })
      await patchTemplateTagRows(ctx, template._id, {
        isPubliclyListable: false,
        updatedAt: now,
      })
    })
  )
  await adjustPublicTemplateCount(ctx, deltas)
}
