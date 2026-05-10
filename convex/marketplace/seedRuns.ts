// convex/marketplace/seedRuns.ts
// seed-run registry & read-only precheck API for Python pipeline

import { ConvexError, v } from 'convex/values'
import {
  action,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { internal } from '../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  MAX_IMAGE_BYTE_SIZE,
  type MediaVariantKind,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import type {
  SeedBeginRunOutput,
  SeedCriterionUpsert,
  SeedItemUpsert,
  SeedRejectedUpload,
  SeedResolvedCriterion,
  SeedResolvedItem,
  SeedResolvedMedia,
  SeedTemplateReleaseStatus,
  SeedActivateReleaseOutput,
  SeedRollbackReleaseOutput,
  SeedRunSummary,
  SeedTemplateCriterionKey,
  SeedTemplateItemKey,
  SeedTemplateUpsert,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { MAX_TEMPLATE_COVER_ITEMS } from '@tierlistbuilder/contracts/marketplace/template'
import {
  assertCountRange,
  assertNonemptyString,
  assertNonnegativeInteger,
  assertPositiveFinite,
  assertPositiveInteger,
  assertUniqueValues,
} from '../lib/assertions'
import { valuesEqual } from '../lib/equality'
import { SEED_LIMITS, SEED_UPLOAD_URL_TTL_MS } from '../lib/limits'
import {
  assertValidVariantRequest,
  computeVariantDedupeHash,
} from '../lib/mediaVariants'
import { parseUploadedImageMetadata } from '../lib/imageValidation'
import { sha256Hex } from '../lib/sha256'
import { deleteStorageSilently } from '../lib/storage'
import {
  imageMimeTypeValidator,
  itemTransformValidator,
  mediaVariantKindValidator,
  seedRunStatusValidator,
  seedTemplateReleaseStatusValidator,
  templateCategoryValidator,
  templateCoverFramingValidator,
  templateCriterionStatusValidator,
  tierPresetTiersValidator,
  templateVisibilityValidator,
} from '../lib/validators'
import {
  allocateTemplateSlug,
  adjustPublicTemplateCount,
  buildTemplateStateFields,
  createTemplateStats,
  markTemplateNotPublic,
  normalizeDescription,
  normalizeTags,
  normalizeTemplateTitle,
  patchTemplateAndSyncCard,
  syncTemplateTagRows,
  validateTemplateTiers,
  writeTemplateCard,
} from './templates/lib'
import {
  buildDefaultTemplateCriteria,
  validateTemplateCriteria,
} from './templates/criteria'
import { requireSeedAuthorized } from './seedAuth'

type SeedRemovalCandidate = {
  templateExternalId: string
  itemExternalId?: string
  criterionExternalId?: string
  action: 'absentFromRelease'
}

type SeedResolvedTemplateRow = {
  externalId: string
  releaseId: string | null
  title: string
  description: string | null
  category: Doc<'templates'>['category']
  tags: string[]
  visibility: Doc<'templates'>['visibility']
  status: SeedTemplateReleaseStatus | null
  itemAspectRatio: number | null
}

type SeedResolveStateResult = {
  activeReleaseId: string | null
  templates: SeedResolvedTemplateRow[]
  items: SeedResolvedItem[]
  criteria: SeedResolvedCriterion[]
  media: SeedResolvedMedia[]
  absentFromManifest: SeedRemovalCandidate[]
}

type SeedUploadVariantKind = Extract<MediaVariantKind, 'tile' | 'preview'>

type SeedUploadedVariantArg = {
  contentHash: string
  storageId: Id<'_storage'>
  kind: SeedUploadVariantKind
  expectedMimeType: SupportedImageMimeType
  expectedByteSize: number
  expectedWidth: number
  expectedHeight: number
}

type SeedUploadedMediaAssetArg = {
  assetKey: string
  variants: SeedUploadedVariantArg[]
}

type VerifiedSeedVariant = {
  kind: SeedUploadVariantKind
  storageId: Id<'_storage'>
  contentHash: string
  mimeType: SupportedImageMimeType
  width: number
  height: number
  byteSize: number
}

type SeedUploadUrlRow = {
  contentHash: string
  uploadUrl: string
  expiresAt: number
}

type SeedCleanupResult = {
  cleanedStorageIds: string[]
  missingStorageIds: string[]
}

type SeedFinalizedMediaRow = {
  assetKey: string
  contentHashes: string[]
  mediaAssetId: string
  reused: boolean
}

type SeedTemplateUpsertArg = SeedTemplateUpsert & {
  suggestedTiers: Doc<'templates'>['suggestedTiers']
}

type SeedItemUpsertArg = SeedItemUpsert & {
  transform: Doc<'templateItems'>['transform']
}

type SeedCriterionUpsertArg = SeedCriterionUpsert

type SeedTemplateApplyPatch = Pick<
  Doc<'templates'>,
  | 'title'
  | 'description'
  | 'category'
  | 'tags'
  | 'visibility'
  | 'coverMediaAssetId'
  | 'coverFraming'
  | 'suggestedTiers'
  | 'itemAspectRatio'
  | 'itemAspectRatioMode'
  | 'defaultItemImageFit'
  | 'itemCount'
  | 'sizeClass'
  | 'publicationState'
  | 'isPubliclyListable'
  | 'seedDatasetKey'
  | 'seedExternalId'
  | 'seedReleaseId'
  | 'seedReleaseStatus'
>

type SeedDiagnosticRow = {
  code: string
  message: string
  path: string
  severity: 'warning' | 'error'
}

const MAX_SEED_STATE_IDS = SEED_LIMITS.stateIds
const MAX_SEED_TEMPLATES_PER_DIFF = SEED_LIMITS.templatesPerDiff
const MAX_SEED_ITEMS_PER_TEMPLATE = SEED_LIMITS.itemsPerTemplate
const MAX_MEDIA_VARIANTS_PER_HASH = SEED_LIMITS.mediaVariantsPerHash
const MAX_SEED_UPLOAD_URLS_PER_CALL = SEED_LIMITS.uploadUrlsPerCall
const MAX_SEED_MEDIA_ASSETS_PER_FINALIZE = SEED_LIMITS.mediaAssetsPerFinalize
const MAX_SEED_STORAGE_IDS_PER_CLEANUP = SEED_LIMITS.storageIdsPerCleanup
const MAX_SEED_TEMPLATE_UPSERTS_PER_CALL = SEED_LIMITS.templateUpsertsPerCall
const MAX_SEED_ITEM_UPSERTS_PER_CALL = SEED_LIMITS.itemUpsertsPerCall
const MAX_SEED_CRITERION_UPSERTS_PER_CALL = SEED_LIMITS.criterionUpsertsPerCall

const seedUploadVariantKindValidator = v.union(
  v.literal('tile'),
  v.literal('preview')
)

const seedRunSummaryValidator = v.object({
  runId: v.string(),
  datasetKey: v.string(),
  releaseId: v.string(),
  status: seedRunStatusValidator,
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  startedBy: v.string(),
  templateCount: v.number(),
  itemCount: v.number(),
  imageVariantCount: v.number(),
  error: v.union(v.string(), v.null()),
})

const seedTemplateItemKeyValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.string(),
})

const seedTemplateCriterionKeyValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
})

const seedResolvedTemplateValidator = v.object({
  externalId: v.string(),
  releaseId: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  category: templateCategoryValidator,
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  status: v.union(seedTemplateReleaseStatusValidator, v.null()),
  itemAspectRatio: v.union(v.number(), v.null()),
})

const seedResolvedItemValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.string(),
  order: v.number(),
  label: v.union(v.string(), v.null()),
  mediaAssetId: v.union(v.string(), v.null()),
})

const seedResolvedCriterionValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  name: v.string(),
  shortName: v.union(v.string(), v.null()),
  prompt: v.string(),
  axisTop: v.union(v.string(), v.null()),
  axisBottom: v.union(v.string(), v.null()),
  order: v.number(),
  isPrimary: v.boolean(),
  status: templateCriterionStatusValidator,
})

const seedResolvedMediaValidator = v.object({
  contentHash: v.string(),
  mediaAssetId: v.string(),
  variantKind: mediaVariantKindValidator,
  byteSize: v.number(),
})

const seedUploadVariantRequestValidator = v.object({
  contentHash: v.string(),
  kind: seedUploadVariantKindValidator,
  mimeType: imageMimeTypeValidator,
  byteSize: v.number(),
})

const seedUploadUrlValidator = v.object({
  contentHash: v.string(),
  uploadUrl: v.string(),
  expiresAt: v.number(),
})

const seedUploadedVariantValidator = v.object({
  contentHash: v.string(),
  storageId: v.id('_storage'),
  kind: seedUploadVariantKindValidator,
  expectedMimeType: imageMimeTypeValidator,
  expectedByteSize: v.number(),
  expectedWidth: v.number(),
  expectedHeight: v.number(),
})

const seedUploadedMediaAssetValidator = v.object({
  assetKey: v.string(),
  variants: v.array(seedUploadedVariantValidator),
})

const seedTemplateUpsertValidator = v.object({
  externalId: v.string(),
  title: v.string(),
  category: templateCategoryValidator,
  description: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  coverMediaContentHash: v.union(v.string(), v.null()),
  coverFraming: v.union(templateCoverFramingValidator, v.null()),
  suggestedTiers: tierPresetTiersValidator,
  itemAspectRatio: v.number(),
  itemCount: v.number(),
})

const seedItemUpsertValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.string(),
  order: v.number(),
  label: v.union(v.string(), v.null()),
  mediaContentHash: v.string(),
  aspectRatio: v.union(v.number(), v.null()),
  transform: v.union(itemTransformValidator, v.null()),
})

const seedCriterionUpsertValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  name: v.string(),
  shortName: v.union(v.string(), v.null()),
  prompt: v.string(),
  axisTop: v.union(v.string(), v.null()),
  axisBottom: v.union(v.string(), v.null()),
  order: v.number(),
  isPrimary: v.boolean(),
  status: templateCriterionStatusValidator,
})

const seedFinalizedMediaValidator = v.object({
  assetKey: v.string(),
  contentHashes: v.array(v.string()),
  mediaAssetId: v.string(),
  reused: v.boolean(),
})

const seedRejectedUploadValidator = v.object({
  assetKey: v.string(),
  contentHash: v.string(),
  storageId: v.string(),
  reason: v.string(),
  cleaned: v.boolean(),
})

const seedCleanupOutputValidator = v.object({
  cleanedStorageIds: v.array(v.string()),
  missingStorageIds: v.array(v.string()),
})

const seedCompiledTotalsValidator = v.object({
  templateCount: v.number(),
  itemCount: v.number(),
  criterionCount: v.number(),
  sourceImageCount: v.number(),
  variantCount: v.number(),
  estimatedUploadBytes: v.number(),
  estimatedStorageBytes: v.number(),
})

const seedDiagnosticValidator = v.object({
  code: v.string(),
  message: v.string(),
  path: v.string(),
  severity: v.union(v.literal('warning'), v.literal('error')),
})

const seedTemplateUpsertOutputValidator = v.object({
  created: v.array(v.string()),
  updated: v.array(v.string()),
  unchanged: v.array(v.string()),
})

const seedItemUpsertOutputValidator = v.object({
  created: v.array(seedTemplateItemKeyValidator),
  updated: v.array(seedTemplateItemKeyValidator),
  moved: v.array(seedTemplateItemKeyValidator),
  unchanged: v.array(seedTemplateItemKeyValidator),
  absentFromRelease: v.array(seedTemplateItemKeyValidator),
})

const seedCriterionUpsertOutputValidator = v.object({
  created: v.array(seedTemplateCriterionKeyValidator),
  updated: v.array(seedTemplateCriterionKeyValidator),
  unchanged: v.array(seedTemplateCriterionKeyValidator),
  deactivated: v.array(seedTemplateCriterionKeyValidator),
})

const seedRemovalCandidateValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.optional(v.string()),
  criterionExternalId: v.optional(v.string()),
  action: v.literal('absentFromRelease'),
})

const resolveStateArgsValidator = {
  seedSecret: v.string(),
  datasetKey: v.string(),
  releaseId: v.string(),
  authorEmail: v.string(),
  templateExternalIds: v.array(v.string()),
  itemExternalIds: v.array(seedTemplateItemKeyValidator),
  criterionExternalIds: v.array(seedTemplateCriterionKeyValidator),
  variantHashes: v.array(v.string()),
}

const resolveStateOutputValidator = v.object({
  activeReleaseId: v.union(v.string(), v.null()),
  templates: v.array(seedResolvedTemplateValidator),
  items: v.array(seedResolvedItemValidator),
  criteria: v.array(seedResolvedCriterionValidator),
  media: v.array(seedResolvedMediaValidator),
  absentFromManifest: v.array(seedRemovalCandidateValidator),
})

const assertBatchSize = (name: string, count: number): void =>
{
  if (count > MAX_SEED_STATE_IDS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${name} exceeds seed precheck batch limit`,
    })
  }
}

const summarizeRun = (run: Doc<'seedRuns'>): SeedRunSummary => ({
  runId: run.runId,
  datasetKey: run.datasetKey,
  releaseId: run.releaseId,
  status: run.status,
  startedAt: run._creationTime,
  finishedAt: run.finishedAt,
  startedBy: run.startedBy,
  templateCount: run.templateCount,
  itemCount: run.itemCount,
  imageVariantCount: run.imageVariantCount,
  error: run.error,
})

const currentSeedActor = async (
  ctx: MutationCtx | QueryCtx
): Promise<string> =>
{
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? identity?.email ?? 'seed-secret'
}

const findSeedAuthorId = async (
  ctx: QueryCtx | MutationCtx,
  authorEmail: string
): Promise<Id<'users'> | null> =>
{
  const user = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', authorEmail))
    .unique()
  return user?._id ?? null
}

export const findSeedAuthorIdByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.id('users'), v.null()),
  handler: async (ctx, args): Promise<Id<'users'> | null> =>
    await findSeedAuthorId(ctx, args.email),
})

export const findSeedMediaByOwnerAndDedupeHash = internalQuery({
  args: {
    ownerId: v.id('users'),
    dedupeHash: v.string(),
  },
  returns: v.union(v.object({ mediaAssetId: v.id('mediaAssets') }), v.null()),
  handler: async (
    ctx,
    args
  ): Promise<{ mediaAssetId: Id<'mediaAssets'> } | null> =>
  {
    const media = await ctx.db
      .query('mediaAssets')
      .withIndex('byOwnerAndDedupeHash', (q) =>
        q.eq('ownerId', args.ownerId).eq('dedupeHash', args.dedupeHash)
      )
      .unique()
    return media ? { mediaAssetId: media._id } : null
  },
})

const toResolvedTemplate = (
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
})

const resolveTemplates = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string,
  externalIds: readonly string[]
): Promise<Map<string, Doc<'templates'>>> =>
{
  if (externalIds.length === 0) return new Map()
  // single index scan + in-memory filter beats N unique() lookups.
  // bySeedDatasetReleaseAndExternalId is prefix-scanned on (dataset, release)
  const requested = new Set(externalIds)
  const all = await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(MAX_SEED_TEMPLATES_PER_DIFF + 1)
  assertSeedTemplateReadLimit(all, releaseId)
  const map = new Map<string, Doc<'templates'>>()
  for (const template of all)
  {
    const externalId = template.seedExternalId
    if (externalId && requested.has(externalId)) map.set(externalId, template)
  }
  return map
}

const resolveItems = async (
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
          .take(MAX_SEED_ITEMS_PER_TEMPLATE)
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
  const resolved: SeedResolvedItem[] = []
  for (const key of keys)
  {
    const item = byTemplate.get(key.templateExternalId)?.get(key.itemExternalId)
    if (!item) continue
    resolved.push({
      templateExternalId: key.templateExternalId,
      itemExternalId: key.itemExternalId,
      order: item.order,
      label: item.label,
      mediaAssetId: item.mediaAssetId as string | null,
    })
  }
  return resolved
}

const resolveCriteria = (
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

const resolveMediaForAuthor = async (
  ctx: QueryCtx,
  authorId: Id<'users'> | null,
  variantHashes: readonly string[]
): Promise<SeedResolvedMedia[]> =>
{
  if (!authorId || variantHashes.length === 0) return []
  // fan out hash lookups in parallel so the query latency tracks the slowest
  // single index probe rather than the sum of all probes
  const variantSets = await Promise.all(
    variantHashes.map(
      async (contentHash) =>
        [
          contentHash,
          await ctx.db
            .query('mediaVariants')
            .withIndex('byContentHash', (q) => q.eq('contentHash', contentHash))
            .take(MAX_MEDIA_VARIANTS_PER_HASH),
        ] as const
    )
  )
  // dedupe asset lookups across hashes — common when tile + preview share the
  // same hash via parallel file uploads
  const assetIds = Array.from(
    new Set(
      variantSets.flatMap(([, variants]) =>
        variants.map((variant) => variant.mediaAssetId as string)
      )
    )
  ) as Id<'mediaAssets'>[]
  const assets = await Promise.all(assetIds.map((id) => ctx.db.get(id)))
  const assetById = new Map<string, Doc<'mediaAssets'>>()
  for (const asset of assets)
  {
    if (asset && asset.ownerId === authorId)
    {
      assetById.set(asset._id as string, asset)
    }
  }
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
        variantKind: variant.kind,
        byteSize: variant.byteSize,
      })
    }
  }
  return resolved
}

const resolveActiveReleaseId = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string
): Promise<string | null> =>
{
  const activeRuns = await ctx.db
    .query('seedRuns')
    .withIndex('byDatasetStatus', (q) =>
      q.eq('datasetKey', datasetKey).eq('status', 'active')
    )
    .order('desc')
    .take(1)
  return activeRuns[0]?.releaseId ?? null
}

const resolveAbsentFromManifest = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string,
  templateIds: ReadonlySet<string>,
  itemKeys: ReadonlyMap<string, ReadonlySet<string>>,
  criterionKeys: ReadonlyMap<string, ReadonlySet<string>>
): Promise<SeedRemovalCandidate[]> =>
{
  const templates = await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(MAX_SEED_TEMPLATES_PER_DIFF)

  const absent: SeedRemovalCandidate[] = []
  for (const template of templates)
  {
    const templateExternalId = template.seedExternalId
    if (!templateExternalId) continue
    if (!templateIds.has(templateExternalId))
    {
      absent.push({
        templateExternalId,
        action: 'absentFromRelease',
      })
      continue
    }

    const manifestItems = itemKeys.get(templateExternalId) ?? new Set<string>()
    const manifestCriteria =
      criterionKeys.get(templateExternalId) ?? new Set<string>()
    for (const criterion of template.criteria)
    {
      if (manifestCriteria.has(criterion.externalId)) continue
      absent.push({
        templateExternalId,
        criterionExternalId: criterion.externalId,
        action: 'absentFromRelease',
      })
    }

    const items = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
      .take(MAX_SEED_ITEMS_PER_TEMPLATE)
    for (const item of items)
    {
      if (manifestItems.has(item.externalId)) continue
      absent.push({
        templateExternalId,
        itemExternalId: item.externalId,
        action: 'absentFromRelease',
      })
    }
  }
  return absent
}

const keySetByTemplate = <T extends { templateExternalId: string }>(
  keys: readonly T[],
  pick: (key: T) => string
): Map<string, Set<string>> =>
{
  const map = new Map<string, Set<string>>()
  for (const key of keys)
  {
    const items = map.get(key.templateExternalId) ?? new Set<string>()
    items.add(pick(key))
    map.set(key.templateExternalId, items)
  }
  return map
}

const rejectUploadedVariant = async (
  ctx: ActionCtx,
  assetKey: string,
  variant: SeedUploadedVariantArg,
  reason: string
): Promise<SeedRejectedUpload> =>
{
  await deleteStorageSilently(ctx, variant.storageId)
  return {
    assetKey,
    contentHash: variant.contentHash,
    storageId: variant.storageId as string,
    reason,
    cleaned: true,
  }
}

const loadVerifiedSeedVariant = async (
  ctx: ActionCtx,
  assetKey: string,
  variant: SeedUploadedVariantArg
): Promise<
  | { kind: 'verified'; variant: VerifiedSeedVariant }
  | { kind: 'rejected'; rejected: SeedRejectedUpload }
> =>
{
  const metadata = await ctx.runQuery(internal.lib.storage.getStorageMetadata, {
    storageId: variant.storageId,
  })
  if (!metadata)
  {
    return {
      kind: 'rejected',
      rejected: {
        assetKey,
        contentHash: variant.contentHash,
        storageId: variant.storageId as string,
        reason: 'uploaded storage object not found',
        cleaned: false,
      },
    }
  }
  if (metadata.size > MAX_IMAGE_BYTE_SIZE)
  {
    return {
      kind: 'rejected',
      rejected: await rejectUploadedVariant(
        ctx,
        assetKey,
        variant,
        `uploaded image blob too large: ${metadata.size} > ${MAX_IMAGE_BYTE_SIZE}`
      ),
    }
  }

  const blob = await ctx.storage.get(variant.storageId)
  if (!blob)
  {
    return {
      kind: 'rejected',
      rejected: {
        assetKey,
        contentHash: variant.contentHash,
        storageId: variant.storageId as string,
        reason: 'uploaded image blob not found',
        cleaned: false,
      },
    }
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  let parsed: ReturnType<typeof parseUploadedImageMetadata>
  let actualHash: string
  try
  {
    parsed = parseUploadedImageMetadata(bytes)
    actualHash = await sha256Hex(bytes as BufferSource)
  }
  catch (error)
  {
    return {
      kind: 'rejected',
      rejected: await rejectUploadedVariant(
        ctx,
        assetKey,
        variant,
        error instanceof Error ? error.message : 'invalid uploaded image'
      ),
    }
  }
  const failures: string[] = []
  if (actualHash !== variant.contentHash) failures.push('contentHash')
  if (parsed.mimeType !== variant.expectedMimeType) failures.push('mimeType')
  if (bytes.byteLength !== variant.expectedByteSize) failures.push('byteSize')
  if (parsed.width !== variant.expectedWidth) failures.push('width')
  if (parsed.height !== variant.expectedHeight) failures.push('height')
  if (failures.length > 0)
  {
    return {
      kind: 'rejected',
      rejected: await rejectUploadedVariant(
        ctx,
        assetKey,
        variant,
        `uploaded variant mismatch: ${failures.join(', ')}`
      ),
    }
  }

  return {
    kind: 'verified',
    variant: {
      kind: variant.kind,
      storageId: variant.storageId,
      contentHash: actualHash,
      mimeType: parsed.mimeType,
      width: parsed.width,
      height: parsed.height,
      byteSize: bytes.byteLength,
    },
  }
}

const validateSeedUploadedAsset = async (
  asset: SeedUploadedMediaAssetArg
): Promise<void> =>
{
  assertNonemptyString('assetKey', asset.assetKey)
  for (const variant of asset.variants)
  {
    assertNonemptyString('contentHash', variant.contentHash)
    assertPositiveInteger('expectedByteSize', variant.expectedByteSize)
    assertPositiveInteger('expectedWidth', variant.expectedWidth)
    assertPositiveInteger('expectedHeight', variant.expectedHeight)
  }
  await assertValidVariantRequest(asset.variants)
}

const cleanupStorageIds = async (
  ctx: ActionCtx,
  storageIds: readonly Id<'_storage'>[]
): Promise<SeedCleanupResult> =>
{
  const cleanedStorageIds: string[] = []
  const missingStorageIds: string[] = []
  // sequential: convex-test runtime serializes storage mutations from a single
  // action, so parallel deletes drop on the floor for parallel test storeges
  for (const storageId of storageIds)
  {
    const metadata = await ctx.runQuery(
      internal.lib.storage.getStorageMetadata,
      { storageId }
    )
    if (!metadata)
    {
      missingStorageIds.push(storageId as string)
      continue
    }
    await deleteStorageSilently(ctx, storageId)
    cleanedStorageIds.push(storageId as string)
  }
  return { cleanedStorageIds, missingStorageIds }
}

const finalizeSeedMediaAsset = async (
  ctx: ActionCtx,
  authorId: Id<'users'>,
  asset: SeedUploadedMediaAssetArg
): Promise<{
  finalized: SeedFinalizedMediaRow | null
  rejected: SeedRejectedUpload[]
}> =>
{
  await validateSeedUploadedAsset(asset)
  const verified: VerifiedSeedVariant[] = []
  const rejected: SeedRejectedUpload[] = []
  const results = await Promise.all(
    asset.variants.map((upload) =>
      loadVerifiedSeedVariant(ctx, asset.assetKey, upload)
    )
  )
  for (const result of results)
  {
    if (result.kind === 'rejected') rejected.push(result.rejected)
    else verified.push(result.variant)
  }

  if (rejected.length > 0)
  {
    await cleanupStorageIds(
      ctx,
      verified.map((variant) => variant.storageId)
    )
    return { finalized: null, rejected }
  }

  const dedupeHash = computeVariantDedupeHash(verified)
  const existing: { mediaAssetId: Id<'mediaAssets'> } | null =
    await ctx.runQuery(
      internal.marketplace.seedRuns.findSeedMediaByOwnerAndDedupeHash,
      {
        ownerId: authorId,
        dedupeHash,
      }
    )
  try
  {
    const finalized = await ctx.runMutation(
      internal.platform.media.internal.finalizeVerifiedMediaAsset,
      {
        userId: authorId,
        variants: verified,
      }
    )
    return {
      finalized: {
        assetKey: asset.assetKey,
        contentHashes: verified.map((variant) => variant.contentHash),
        mediaAssetId: finalized.mediaAssetId as string,
        reused: existing?.mediaAssetId === finalized.mediaAssetId,
      },
      rejected: [],
    }
  }
  catch (error)
  {
    await cleanupStorageIds(
      ctx,
      verified.map((variant) => variant.storageId)
    )
    throw error
  }
}

const toSeedItemKey = (item: {
  templateExternalId: string
  itemExternalId: string
}): SeedTemplateItemKey => ({
  templateExternalId: item.templateExternalId,
  itemExternalId: item.itemExternalId,
})

const toSeedCriterionKey = (criterion: {
  templateExternalId: string
  criterionExternalId: string
}): SeedTemplateCriterionKey => ({
  templateExternalId: criterion.templateExternalId,
  criterionExternalId: criterion.criterionExternalId,
})

const groupByTemplateExternalId = <T extends { templateExternalId: string }>(
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

// resolve many content hashes -> mediaAssetId in one batched parallel pass
// for an upsert call. callers should look up via the map instead of issuing
// one byContentHash + N db.get() calls per row, which blows the read budget
const buildSeedMediaAssetIdCache = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  contentHashes: readonly string[]
): Promise<Map<string, Id<'mediaAssets'>>> =>
{
  const unique = Array.from(new Set(contentHashes.filter((h) => h.length > 0)))
  if (unique.length === 0) return new Map()
  // fan out hash -> variants probes; dedupe asset IDs across hashes before
  // fetching mediaAssets so we issue at most N_unique_assets db.get() calls
  const variantSets = await Promise.all(
    unique.map(
      async (contentHash) =>
        [
          contentHash,
          await ctx.db
            .query('mediaVariants')
            .withIndex('byContentHash', (q) => q.eq('contentHash', contentHash))
            .take(MAX_MEDIA_VARIANTS_PER_HASH),
        ] as const
    )
  )
  const assetIds = Array.from(
    new Set(
      variantSets.flatMap(([, variants]) =>
        variants.map((variant) => variant.mediaAssetId as string)
      )
    )
  ) as Id<'mediaAssets'>[]
  const assets = await Promise.all(assetIds.map((id) => ctx.db.get(id)))
  const ownedById = new Map<string, Id<'mediaAssets'>>()
  for (const asset of assets)
  {
    if (asset && asset.ownerId === ownerId)
    {
      ownedById.set(asset._id as string, asset._id)
    }
  }
  const result = new Map<string, Id<'mediaAssets'>>()
  for (const [contentHash, variants] of variantSets)
  {
    for (const variant of variants)
    {
      const owned = ownedById.get(variant.mediaAssetId as string)
      if (owned)
      {
        result.set(contentHash, owned)
        break
      }
    }
  }
  return result
}

const resolveSeedMediaAssetIdFromCache = (
  cache: ReadonlyMap<string, Id<'mediaAssets'>>,
  contentHash: string
): Id<'mediaAssets'> =>
{
  assertNonemptyString('mediaContentHash', contentHash)
  const mediaAssetId = cache.get(contentHash)
  if (mediaAssetId) return mediaAssetId
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.notFound,
    message: `seed media not found by content hash: ${contentHash}`,
  })
}

const buildSeedTemplateCoverItems = async (
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

const countSeedTemplateItems = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<number> =>
{
  const items = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(MAX_SEED_ITEMS_PER_TEMPLATE + 1)
  if (items.length > MAX_SEED_ITEMS_PER_TEMPLATE)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed template item count exceeds apply limit',
    })
  }
  return items.length
}

const patchSeedTemplateItemSummary = async (
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

const normalizeSeedTemplateUpsert = (
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

const templatePatchChanged = (
  template: Doc<'templates'>,
  patch: Partial<Doc<'templates'>>
): boolean =>
  Object.entries(patch).some(
    ([key, value]) =>
      !valuesEqual(template[key as keyof Doc<'templates'>], value)
  )

const loadSeedRun = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string,
  runId: string
): Promise<Doc<'seedRuns'> | null> =>
{
  const run = await ctx.db
    .query('seedRuns')
    .withIndex('byRunId', (q) => q.eq('runId', runId))
    .unique()
  if (!run || run.datasetKey !== datasetKey || run.releaseId !== releaseId)
  {
    return null
  }
  return run
}

const loadSeedRunOrThrow = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string,
  runId: string
): Promise<Doc<'seedRuns'>> =>
{
  const run = await loadSeedRun(ctx, datasetKey, releaseId, runId)
  if (!run)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed run not found: ${runId}`,
    })
  }
  return run
}

const loadLatestSeedRunForRelease = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'seedRuns'> | null> =>
{
  const runs = await ctx.db
    .query('seedRuns')
    .withIndex('byDatasetRelease', (q) =>
      q.eq('datasetKey', datasetKey).eq('releaseId', releaseId)
    )
    .order('desc')
    .take(1)
  return runs[0] ?? null
}

const loadSeedTemplatesForRelease = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'templates'>[]> =>
  await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(MAX_SEED_TEMPLATES_PER_DIFF + 1)

const assertSeedTemplateReadLimit = (
  templates: readonly Doc<'templates'>[],
  releaseId: string | null | undefined
): void =>
{
  if (templates.length <= MAX_SEED_TEMPLATES_PER_DIFF) return
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `seed release exceeds template read limit: ${releaseId ?? 'unknown'}`,
  })
}

const loadSeedTemplateLookupForRelease = async (
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

const buildSeedReleaseDiagnostics = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  expectedTotals: {
    templateCount: number
    itemCount: number
    criterionCount: number
  }
): Promise<SeedDiagnosticRow[]> =>
{
  const diagnostics: SeedDiagnosticRow[] = []
  const templates = await loadSeedTemplatesForRelease(
    ctx,
    datasetKey,
    releaseId
  )
  if (templates.length > MAX_SEED_TEMPLATES_PER_DIFF)
  {
    diagnostics.push({
      code: 'templateLimitExceeded',
      message: 'release has more templates than seed verification can inspect',
      path: '$.templates',
      severity: 'error',
    })
    return diagnostics
  }

  const validTemplateStatuses = new Set<SeedTemplateReleaseStatus>([
    'applied_hidden',
    'verified',
    'active',
  ])
  // fan out per-template reads (cover + items + each item's media) so verify
  // completes in O(slowest template); releases over the read budget already
  // short-circuit above via templateLimitExceeded
  const perTemplate = await Promise.all(
    templates.map(async (template) =>
    {
      const [coverMedia, items] = await Promise.all([
        template.coverMediaAssetId
          ? ctx.db.get(template.coverMediaAssetId)
          : Promise.resolve(null),
        ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .take(MAX_SEED_ITEMS_PER_TEMPLATE + 1),
      ])
      const itemMedia =
        items.length > MAX_SEED_ITEMS_PER_TEMPLATE
          ? null
          : await Promise.all(
              items.map((item) =>
                item.mediaAssetId
                  ? ctx.db.get(item.mediaAssetId)
                  : Promise.resolve(null)
              )
            )
      return { template, coverMedia, items, itemMedia }
    })
  )
  let itemCount = 0
  let criterionCount = 0
  for (const { template, coverMedia, items, itemMedia } of perTemplate)
  {
    const templatePath = `$.templates[${template.seedExternalId ?? template._id}]`
    if (
      !template.seedReleaseStatus ||
      !validTemplateStatuses.has(template.seedReleaseStatus)
    )
    {
      diagnostics.push({
        code: 'invalidTemplateReleaseStatus',
        message: `template has invalid seed release status: ${template.seedExternalId}`,
        path: `${templatePath}.seedReleaseStatus`,
        severity: 'error',
      })
    }
    if (template.coverMediaAssetId !== null && !coverMedia)
    {
      diagnostics.push({
        code: 'missingCoverMedia',
        message: `template cover media is missing: ${template.seedExternalId}`,
        path: `${templatePath}.coverMediaAssetId`,
        severity: 'error',
      })
    }
    if (items.length > MAX_SEED_ITEMS_PER_TEMPLATE)
    {
      diagnostics.push({
        code: 'itemLimitExceeded',
        message: `template item count exceeds seed verification limit: ${template.seedExternalId}`,
        path: `${templatePath}.items`,
        severity: 'error',
      })
      continue
    }
    itemCount += items.length
    criterionCount += template.criteria.length
    if (template.itemCount !== items.length)
    {
      diagnostics.push({
        code: 'templateItemCountMismatch',
        message: `template itemCount=${template.itemCount} but has ${items.length} item rows`,
        path: `${templatePath}.itemCount`,
        severity: 'error',
      })
    }
    if (itemMedia)
    {
      for (let index = 0; index < items.length; index += 1)
      {
        const item = items[index]
        if (item.mediaAssetId === null)
        {
          diagnostics.push({
            code: 'missingItemMedia',
            message: `template item has no media: ${item.externalId}`,
            path: `${templatePath}.items[${item.externalId}].mediaAssetId`,
            severity: 'error',
          })
          continue
        }
        if (!itemMedia[index])
        {
          diagnostics.push({
            code: 'missingItemMediaAsset',
            message: `template item media asset is missing: ${item.externalId}`,
            path: `${templatePath}.items[${item.externalId}].mediaAssetId`,
            severity: 'error',
          })
        }
      }
    }
  }

  const actual = {
    templateCount: templates.length,
    itemCount,
    criterionCount,
  }
  for (const key of Object.keys(actual) as (keyof typeof actual)[])
  {
    if (actual[key] === expectedTotals[key]) continue
    diagnostics.push({
      code: `${key}Mismatch`,
      message: `${key} expected ${expectedTotals[key]} but found ${actual[key]}`,
      path: `$.totals.${key}`,
      severity: 'error',
    })
  }
  return diagnostics
}

const assertSeedCompiledTotals = (totals: Record<string, number>): void =>
{
  for (const [key, value] of Object.entries(totals))
  {
    assertNonnegativeInteger(`expectedTotals.${key}`, value)
  }
}

const hasErrorDiagnostics = (
  diagnostics: readonly SeedDiagnosticRow[]
): boolean => diagnostics.some((diagnostic) => diagnostic.severity === 'error')

const setSeedRunStatus = async (
  ctx: MutationCtx,
  run: Doc<'seedRuns'>,
  status: Doc<'seedRuns'>['status'],
  error: string | null = null,
  now = Date.now()
): Promise<void> =>
{
  const terminalStatuses = new Set<Doc<'seedRuns'>['status']>([
    'active',
    'verified',
    'failed',
    'rolled_back',
  ])
  const finishedAt = terminalStatuses.has(status) ? now : run.finishedAt
  if (
    run.status === status &&
    run.error === error &&
    run.finishedAt === finishedAt
  )
  {
    return
  }
  await ctx.db.patch(run._id, { status, error, finishedAt })
}

const publishSeedReleaseTemplates = async (
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

const rollBackSeedReleaseTemplates = async (
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

const activateSeedReleaseInternal = async (
  ctx: MutationCtx,
  params: {
    datasetKey: string
    releaseId: string
    run: Doc<'seedRuns'>
    previousReleaseId: string | null
    requireVerified: boolean
  }
): Promise<{ activeReleaseId: string; previousReleaseId: string | null }> =>
{
  if (
    params.requireVerified &&
    params.run.status !== 'verified' &&
    params.run.status !== 'active'
  )
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed release must be verified before activation',
    })
  }
  const currentActive = await resolveActiveReleaseId(ctx, params.datasetKey)
  if (currentActive === params.releaseId)
  {
    const targetTemplates = await loadSeedTemplatesForRelease(
      ctx,
      params.datasetKey,
      params.releaseId
    )
    if (targetTemplates.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed release has no templates: ${params.releaseId}`,
      })
    }
    const now = Date.now()
    await publishSeedReleaseTemplates(ctx, targetTemplates, now)
    await setSeedRunStatus(ctx, params.run, 'active', null, now)
    return {
      activeReleaseId: params.releaseId,
      previousReleaseId: currentActive,
    }
  }
  if (currentActive !== params.previousReleaseId)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'active seed release changed since preflight',
    })
  }
  const targetTemplates = await loadSeedTemplatesForRelease(
    ctx,
    params.datasetKey,
    params.releaseId
  )
  if (targetTemplates.length === 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed release has no templates: ${params.releaseId}`,
    })
  }

  const now = Date.now()
  if (currentActive && currentActive !== params.releaseId)
  {
    const previousTemplates = await loadSeedTemplatesForRelease(
      ctx,
      params.datasetKey,
      currentActive
    )
    await rollBackSeedReleaseTemplates(ctx, previousTemplates, now)
    const activeRuns = await ctx.db
      .query('seedRuns')
      .withIndex('byDatasetStatus', (q) =>
        q.eq('datasetKey', params.datasetKey).eq('status', 'active')
      )
      .take(MAX_SEED_TEMPLATES_PER_DIFF)
    await Promise.all(
      activeRuns
        .filter((run) => run.releaseId !== params.releaseId)
        .map((run) => setSeedRunStatus(ctx, run, 'rolled_back', null, now))
    )
  }

  await publishSeedReleaseTemplates(ctx, targetTemplates, now)
  await setSeedRunStatus(ctx, params.run, 'active', null, now)
  return {
    activeReleaseId: params.releaseId,
    previousReleaseId: currentActive,
  }
}

export const beginSeedRun = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    templateCount: v.number(),
    itemCount: v.number(),
    imageVariantCount: v.number(),
  },
  returns: v.object({ run: seedRunSummaryValidator }),
  handler: async (ctx, args): Promise<SeedBeginRunOutput> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonnegativeInteger('templateCount', args.templateCount)
    assertNonnegativeInteger('itemCount', args.itemCount)
    assertNonnegativeInteger('imageVariantCount', args.imageVariantCount)
    const existing = await ctx.db
      .query('seedRuns')
      .withIndex('byRunId', (q) => q.eq('runId', args.runId))
      .unique()
    if (existing)
    {
      if (
        existing.datasetKey !== args.datasetKey ||
        existing.releaseId !== args.releaseId
      )
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: 'runId already belongs to a different seed release',
        })
      }
      return { run: summarizeRun(existing) }
    }

    const startedBy = await currentSeedActor(ctx)
    const runId = await ctx.db.insert('seedRuns', {
      runId: args.runId,
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      status: 'building',
      finishedAt: null,
      startedBy,
      templateCount: args.templateCount,
      itemCount: args.itemCount,
      imageVariantCount: args.imageVariantCount,
      error: null,
    })
    const run = await ctx.db.get(runId)
    if (!run)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'seed run insert did not return a readable row',
      })
    }
    return { run: summarizeRun(run) }
  },
})

export const generateSeedUploadUrls = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    variants: v.array(seedUploadVariantRequestValidator),
  },
  returns: v.object({ urls: v.array(seedUploadUrlValidator) }),
  handler: async (ctx, args): Promise<{ urls: SeedUploadUrlRow[] }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertCountRange(
      'variants',
      args.variants.length,
      1,
      MAX_SEED_UPLOAD_URLS_PER_CALL
    )
    const expiresAt = Date.now() + SEED_UPLOAD_URL_TTL_MS
    const urls = await Promise.all(
      args.variants.map(async (variant) =>
      {
        assertNonemptyString('contentHash', variant.contentHash)
        assertPositiveInteger('byteSize', variant.byteSize)
        if (variant.byteSize > MAX_IMAGE_BYTE_SIZE)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.payloadTooLarge,
            message: `seed upload variant too large: ${variant.byteSize} > ${MAX_IMAGE_BYTE_SIZE}`,
          })
        }
        return {
          contentHash: variant.contentHash,
          uploadUrl: await ctx.storage.generateUploadUrl(),
          expiresAt,
        }
      })
    )
    return { urls }
  },
})

export const finalizeSeedUploadedMedia = action({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    authorEmail: v.string(),
    assets: v.array(seedUploadedMediaAssetValidator),
  },
  returns: v.object({
    finalized: v.array(seedFinalizedMediaValidator),
    rejected: v.array(seedRejectedUploadValidator),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    finalized: SeedFinalizedMediaRow[]
    rejected: SeedRejectedUpload[]
  }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('authorEmail', args.authorEmail)
    assertCountRange(
      'assets',
      args.assets.length,
      1,
      MAX_SEED_MEDIA_ASSETS_PER_FINALIZE
    )
    const authorId: Id<'users'> | null = await ctx.runQuery(
      internal.marketplace.seedRuns.findSeedAuthorIdByEmail,
      { email: args.authorEmail }
    )
    if (!authorId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed author user not found: ${args.authorEmail}`,
      })
    }

    const finalized: SeedFinalizedMediaRow[] = []
    const rejected: SeedRejectedUpload[] = []
    for (const asset of args.assets)
    {
      const result = await finalizeSeedMediaAsset(ctx, authorId, asset)
      if (result.finalized) finalized.push(result.finalized)
      rejected.push(...result.rejected)
    }
    return { finalized, rejected }
  },
})

export const cleanupAbandonedSeedRun = action({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    storageIds: v.array(v.id('_storage')),
  },
  returns: seedCleanupOutputValidator,
  handler: async (ctx, args): Promise<SeedCleanupResult> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertCountRange(
      'storageIds',
      args.storageIds.length,
      0,
      MAX_SEED_STORAGE_IDS_PER_CLEANUP
    )
    return await cleanupStorageIds(ctx, args.storageIds)
  },
})

export const upsertSeedTemplates = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    authorEmail: v.string(),
    templates: v.array(seedTemplateUpsertValidator),
  },
  returns: seedTemplateUpsertOutputValidator,
  handler: async (
    ctx,
    args
  ): Promise<{ created: string[]; updated: string[]; unchanged: string[] }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('authorEmail', args.authorEmail)
    assertCountRange(
      'templates',
      args.templates.length,
      1,
      MAX_SEED_TEMPLATE_UPSERTS_PER_CALL
    )
    assertUniqueValues(
      'seed template externalId',
      args.templates.map((template) => template.externalId)
    )
    const authorId = await findSeedAuthorId(ctx, args.authorEmail)
    if (!authorId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed author user not found: ${args.authorEmail}`,
      })
    }

    const created: string[] = []
    const updated: string[] = []
    const unchanged: string[] = []
    // batch all cover-media & existing-template lookups up-front so per-template
    // work skips repeated index probes & stays under the per-mutation read cap
    const coverHashes = (args.templates as SeedTemplateUpsertArg[])
      .map((template) => template.coverMediaContentHash)
      .filter((hash): hash is string => hash !== null)
    const mediaAssetCache = await buildSeedMediaAssetIdCache(
      ctx,
      authorId,
      coverHashes
    )
    const { byExternalId: existingByExternalId } =
      await loadSeedTemplateLookupForRelease(
        ctx,
        args.datasetKey,
        args.releaseId
      )
    for (const template of args.templates as SeedTemplateUpsertArg[])
    {
      const patch = normalizeSeedTemplateUpsert(
        args.datasetKey,
        args.releaseId,
        template,
        mediaAssetCache
      )
      const existing = existingByExternalId.get(template.externalId) ?? null
      const now = Date.now()
      if (!existing)
      {
        const slug = await allocateTemplateSlug(ctx)
        const templateFields = {
          slug,
          authorId,
          title: patch.title,
          description: patch.description,
          category: patch.category,
          tags: patch.tags,
          visibility: patch.visibility,
          coverMediaAssetId: patch.coverMediaAssetId,
          coverFraming: patch.coverFraming,
          coverItems: [],
          suggestedTiers: patch.suggestedTiers,
          criteria: buildDefaultTemplateCriteria(),
          sourceBoardId: null,
          sizeClass: patch.sizeClass,
          publicationState: patch.publicationState,
          isPubliclyListable: patch.isPubliclyListable,
          itemCount: patch.itemCount,
          featuredRank: null,
          creditLine: null,
          itemAspectRatio: patch.itemAspectRatio,
          itemAspectRatioMode: patch.itemAspectRatioMode,
          defaultItemImageFit: patch.defaultItemImageFit,
          seedDatasetKey: args.datasetKey,
          seedExternalId: template.externalId,
          seedReleaseId: args.releaseId,
          seedReleaseStatus: 'applied_hidden',
          createdAt: now,
          updatedAt: now,
        } satisfies Omit<Doc<'templates'>, '_id' | '_creationTime'>
        const templateId = await ctx.db.insert('templates', templateFields)
        const [stats, row] = await Promise.all([
          createTemplateStats(ctx, templateId, now),
          ctx.db.get(templateId),
        ])
        if (!row)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message: 'seed template insert did not return a readable row',
          })
        }
        await syncTemplateTagRows(ctx, row)
        await writeTemplateCard(ctx, row, stats)
        created.push(template.externalId)
        continue
      }

      if (!templatePatchChanged(existing, patch))
      {
        unchanged.push(template.externalId)
        continue
      }
      const nextTemplate = await patchTemplateAndSyncCard(ctx, existing, {
        ...patch,
        updatedAt: now,
      })
      await syncTemplateTagRows(ctx, nextTemplate)
      updated.push(template.externalId)
    }
    return { created, updated, unchanged }
  },
})

export const upsertSeedItems = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    items: v.array(seedItemUpsertValidator),
  },
  returns: seedItemUpsertOutputValidator,
  handler: async (
    ctx,
    args
  ): Promise<{
    created: SeedTemplateItemKey[]
    updated: SeedTemplateItemKey[]
    moved: SeedTemplateItemKey[]
    unchanged: SeedTemplateItemKey[]
    absentFromRelease: SeedTemplateItemKey[]
  }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertCountRange(
      'items',
      args.items.length,
      1,
      MAX_SEED_ITEM_UPSERTS_PER_CALL
    )
    assertUniqueValues(
      'seed item key',
      args.items.map(
        (item) => `${item.templateExternalId}/${item.itemExternalId}`
      )
    )

    const created: SeedTemplateItemKey[] = []
    const updated: SeedTemplateItemKey[] = []
    const moved: SeedTemplateItemKey[] = []
    const unchanged: SeedTemplateItemKey[] = []
    const absentFromRelease: SeedTemplateItemKey[] = []
    const grouped = groupByTemplateExternalId(args.items as SeedItemUpsertArg[])
    const { templates: releaseTemplates, byExternalId: templatesByExternalId } =
      await loadSeedTemplateLookupForRelease(
        ctx,
        args.datasetKey,
        args.releaseId
      )
    // pre-resolve every content hash this batch will reference. ownerId is
    // shared across a release so a single cache covers all groups
    const firstTemplate = releaseTemplates[0]
    const itemMediaCache = firstTemplate
      ? await buildSeedMediaAssetIdCache(
          ctx,
          firstTemplate.authorId,
          (args.items as SeedItemUpsertArg[]).map(
            (item) => item.mediaContentHash
          )
        )
      : new Map<string, Id<'mediaAssets'>>()
    for (const [templateExternalId, items] of grouped)
    {
      const template = templatesByExternalId.get(templateExternalId)
      if (!template)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `seed template not found: ${templateExternalId}`,
        })
      }
      const seen = new Set<string>()
      for (const item of items)
      {
        assertNonemptyString('itemExternalId', item.itemExternalId)
        assertNonnegativeInteger('order', item.order)
        if (item.aspectRatio !== null)
        {
          assertPositiveFinite('aspectRatio', item.aspectRatio)
        }
        seen.add(item.itemExternalId)
        const key = toSeedItemKey(item)
        const mediaAssetId = resolveSeedMediaAssetIdFromCache(
          itemMediaCache,
          item.mediaContentHash
        )
        const existing = await ctx.db
          .query('templateItems')
          .withIndex('byTemplateAndExternalId', (q) =>
            q
              .eq('templateId', template._id)
              .eq('externalId', item.itemExternalId)
          )
          .unique()
        const fields = {
          label: item.label,
          backgroundColor: null,
          altText: item.label,
          mediaAssetId,
          order: item.order,
          aspectRatio: item.aspectRatio,
          imageFit: null,
          transform: item.transform,
        }
        if (!existing)
        {
          await ctx.db.insert('templateItems', {
            templateId: template._id,
            externalId: item.itemExternalId,
            ...fields,
          })
          created.push(key)
          continue
        }
        const orderChanged = existing.order !== item.order
        const contentChanged =
          existing.label !== fields.label ||
          existing.altText !== fields.altText ||
          existing.mediaAssetId !== fields.mediaAssetId ||
          existing.aspectRatio !== fields.aspectRatio ||
          existing.imageFit !== fields.imageFit ||
          !valuesEqual(existing.transform, fields.transform)
        if (!orderChanged && !contentChanged)
        {
          unchanged.push(key)
          continue
        }
        await ctx.db.patch(existing._id, fields)
        if (orderChanged) moved.push(key)
        if (contentChanged) updated.push(key)
      }

      const existingItems = await ctx.db
        .query('templateItems')
        .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
        .take(MAX_SEED_ITEMS_PER_TEMPLATE)
      await Promise.all(
        existingItems
          .filter((item) => !seen.has(item.externalId))
          .map(async (item) =>
          {
            await ctx.db.delete(item._id)
            absentFromRelease.push({
              templateExternalId,
              itemExternalId: item.externalId,
            })
          })
      )
      await patchSeedTemplateItemSummary(ctx, template)
    }
    return { created, updated, moved, unchanged, absentFromRelease }
  },
})

export const upsertSeedCriteria = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    criteria: v.array(seedCriterionUpsertValidator),
  },
  returns: seedCriterionUpsertOutputValidator,
  handler: async (
    ctx,
    args
  ): Promise<{
    created: SeedTemplateCriterionKey[]
    updated: SeedTemplateCriterionKey[]
    unchanged: SeedTemplateCriterionKey[]
    deactivated: SeedTemplateCriterionKey[]
  }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertCountRange(
      'criteria',
      args.criteria.length,
      1,
      MAX_SEED_CRITERION_UPSERTS_PER_CALL
    )
    assertUniqueValues(
      'seed criterion key',
      args.criteria.map(
        (criterion) =>
          `${criterion.templateExternalId}/${criterion.criterionExternalId}`
      )
    )

    const created: SeedTemplateCriterionKey[] = []
    const updated: SeedTemplateCriterionKey[] = []
    const unchanged: SeedTemplateCriterionKey[] = []
    const deactivated: SeedTemplateCriterionKey[] = []
    const { byExternalId: templatesByExternalId } =
      await loadSeedTemplateLookupForRelease(
        ctx,
        args.datasetKey,
        args.releaseId
      )
    for (const [templateExternalId, criteria] of groupByTemplateExternalId(
      args.criteria as SeedCriterionUpsertArg[]
    ))
    {
      const template = templatesByExternalId.get(templateExternalId)
      if (!template)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `seed template not found: ${templateExternalId}`,
        })
      }
      const existingByExternalId = new Map(
        template.criteria.map((criterion) => [criterion.externalId, criterion])
      )
      const seen = new Set<string>()
      const nextCriteria = criteria.map((criterion) =>
      {
        assertNonemptyString(
          'criterionExternalId',
          criterion.criterionExternalId
        )
        seen.add(criterion.criterionExternalId)
        const key = toSeedCriterionKey(criterion)
        const next = {
          externalId: criterion.criterionExternalId,
          name: criterion.name,
          shortName: criterion.shortName,
          prompt: criterion.prompt,
          axisTop: criterion.axisTop,
          axisBottom: criterion.axisBottom,
          order: criterion.order,
          isPrimary: criterion.isPrimary,
          status: criterion.status,
        }
        const existing = existingByExternalId.get(criterion.criterionExternalId)
        if (!existing)
        {
          created.push(key)
        }
        else if (valuesEqual(existing, next))
        {
          unchanged.push(key)
        }
        else
        {
          updated.push(key)
        }
        return next
      })

      for (const existing of template.criteria)
      {
        if (seen.has(existing.externalId)) continue
        deactivated.push({
          templateExternalId,
          criterionExternalId: existing.externalId,
        })
      }

      const normalized = validateTemplateCriteria(nextCriteria)
      if (valuesEqual(template.criteria, normalized))
      {
        continue
      }
      await patchTemplateAndSyncCard(ctx, template, {
        criteria: normalized,
        seedReleaseStatus: 'applied_hidden',
        updatedAt: Date.now(),
      })
    }
    return { created, updated, unchanged, deactivated }
  },
})

export const verifySeedRelease = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    expectedTotals: seedCompiledTotalsValidator,
  },
  returns: v.object({
    verified: v.boolean(),
    diagnostics: v.array(seedDiagnosticValidator),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ verified: boolean; diagnostics: SeedDiagnosticRow[] }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertSeedCompiledTotals(args.expectedTotals)
    const run = await loadSeedRunOrThrow(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.runId
    )
    const diagnostics = await buildSeedReleaseDiagnostics(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.expectedTotals
    )
    const verified = !hasErrorDiagnostics(diagnostics)
    if (verified)
    {
      if (run.status !== 'active')
      {
        await setSeedRunStatus(ctx, run, 'verified')
      }
      return { verified, diagnostics }
    }

    await setSeedRunStatus(
      ctx,
      run,
      'failed',
      `seed verification failed: ${diagnostics.length} diagnostics`
    )
    return { verified, diagnostics }
  },
})

export const activateSeedRelease = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    previousReleaseId: v.union(v.string(), v.null()),
    confirm: v.literal(true),
  },
  returns: v.object({
    activeReleaseId: v.string(),
    previousReleaseId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<SeedActivateReleaseOutput> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    const run = await loadSeedRunOrThrow(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.runId
    )
    return await activateSeedReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      run,
      previousReleaseId: args.previousReleaseId,
      requireVerified: true,
    })
  },
})

export const rollbackSeedRelease = mutation({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    targetReleaseId: v.string(),
    confirm: v.literal(true),
  },
  returns: v.object({
    activeReleaseId: v.string(),
    rolledBackReleaseId: v.string(),
  }),
  handler: async (ctx, args): Promise<SeedRollbackReleaseOutput> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('targetReleaseId', args.targetReleaseId)
    if (args.releaseId === args.targetReleaseId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: 'rollback target must differ from releaseId',
      })
    }

    const run = await loadSeedRunOrThrow(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.runId
    )
    const currentActive = await resolveActiveReleaseId(ctx, args.datasetKey)
    if (currentActive === args.targetReleaseId)
    {
      await setSeedRunStatus(ctx, run, 'rolled_back')
      return {
        activeReleaseId: args.targetReleaseId,
        rolledBackReleaseId: args.releaseId,
      }
    }
    if (currentActive !== args.releaseId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'rollback release is not the current active release',
      })
    }

    const targetRun = await loadLatestSeedRunForRelease(
      ctx,
      args.datasetKey,
      args.targetReleaseId
    )
    const restorableTargetStatuses = new Set<Doc<'seedRuns'>['status']>([
      'active',
      'rolled_back',
    ])
    if (!targetRun || !restorableTargetStatuses.has(targetRun.status))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `rollback target has no restorable seed run: ${args.targetReleaseId}`,
      })
    }
    const activated = await activateSeedReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.targetReleaseId,
      run: targetRun,
      previousReleaseId: args.releaseId,
      requireVerified: false,
    })
    await setSeedRunStatus(ctx, run, 'rolled_back')
    return {
      activeReleaseId: activated.activeReleaseId,
      rolledBackReleaseId: args.releaseId,
    }
  },
})

export const resolveSeedMediaByHashes = query({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    authorEmail: v.string(),
    variantHashes: v.array(v.string()),
  },
  returns: v.object({ media: v.array(seedResolvedMediaValidator) }),
  handler: async (ctx, args): Promise<{ media: SeedResolvedMedia[] }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertBatchSize('variantHashes', args.variantHashes.length)
    const authorId = await findSeedAuthorId(ctx, args.authorEmail)
    return {
      media: await resolveMediaForAuthor(ctx, authorId, args.variantHashes),
    }
  },
})

export const resolveSeedState = query({
  args: resolveStateArgsValidator,
  returns: resolveStateOutputValidator,
  handler: async (ctx, args): Promise<SeedResolveStateResult> =>
  {
    requireSeedAuthorized(args.seedSecret)
    assertBatchSize('templateExternalIds', args.templateExternalIds.length)
    assertBatchSize('itemExternalIds', args.itemExternalIds.length)
    assertBatchSize('criterionExternalIds', args.criterionExternalIds.length)
    assertBatchSize('variantHashes', args.variantHashes.length)

    const templates = await resolveTemplates(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.templateExternalIds
    )
    const authorId = await findSeedAuthorId(ctx, args.authorEmail)
    const itemMap = keySetByTemplate(
      args.itemExternalIds,
      (key) => key.itemExternalId
    )
    const criterionMap = keySetByTemplate(
      args.criterionExternalIds,
      (key) => key.criterionExternalId
    )
    const [items, media, activeReleaseId, absentFromManifest] =
      await Promise.all([
        resolveItems(ctx, templates, args.itemExternalIds),
        resolveMediaForAuthor(ctx, authorId, args.variantHashes),
        resolveActiveReleaseId(ctx, args.datasetKey),
        resolveAbsentFromManifest(
          ctx,
          args.datasetKey,
          args.releaseId,
          new Set(args.templateExternalIds),
          itemMap,
          criterionMap
        ),
      ])

    return {
      activeReleaseId,
      templates: [...templates.values()].map(toResolvedTemplate),
      items,
      criteria: resolveCriteria(templates, args.criterionExternalIds),
      media,
      absentFromManifest,
    }
  },
})

export const getSeedRunStatus = query({
  args: {
    seedSecret: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
  },
  returns: v.object({ run: v.union(seedRunSummaryValidator, v.null()) }),
  handler: async (ctx, args): Promise<{ run: SeedRunSummary | null }> =>
  {
    requireSeedAuthorized(args.seedSecret)
    const run = await ctx.db
      .query('seedRuns')
      .withIndex('byRunId', (q) => q.eq('runId', args.runId))
      .unique()
    if (
      !run ||
      run.datasetKey !== args.datasetKey ||
      run.releaseId !== args.releaseId
    )
    {
      return { run: null }
    }
    return { run: summarizeRun(run) }
  },
})
