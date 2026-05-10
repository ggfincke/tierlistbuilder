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
  SeedRejectedUpload,
  SeedResolvedCriterion,
  SeedResolvedItem,
  SeedResolvedMedia,
  SeedReleaseStatus,
  SeedRunSummary,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { parseUploadedImageMetadata } from '../lib/imageValidation'
import { sha256Hex } from '../lib/sha256'
import { deleteStorageSilently } from '../lib/storage'
import {
  imageMimeTypeValidator,
  mediaVariantKindValidator,
  seedReleaseStatusValidator,
  templateCategoryValidator,
  templateCriterionStatusValidator,
  templateVisibilityValidator,
} from '../lib/validators'
import { requireSeedAuthorized } from './seedAuth'

type SeedRemovalCandidate = {
  templateExternalId: string
  itemExternalId?: string
  criterionExternalId?: string
  action: 'absentFromRelease'
}

type SeedResolvedTemplateRow = {
  externalId: string
  templateId: string
  releaseId: string | null
  title: string
  description: string | null
  category: Doc<'templates'>['category']
  tags: string[]
  visibility: Doc<'templates'>['visibility']
  status: SeedReleaseStatus | null
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

const MAX_SEED_STATE_IDS = 8192
const MAX_SEED_TEMPLATES_PER_DIFF = 2048
const MAX_SEED_ITEMS_PER_TEMPLATE = 4096
const MAX_MEDIA_VARIANTS_PER_HASH = 64
const MAX_SEED_UPLOAD_URLS_PER_CALL = 128
const MAX_SEED_MEDIA_ASSETS_PER_FINALIZE = 64
const MAX_SEED_STORAGE_IDS_PER_CLEANUP = 256
const SEED_UPLOAD_URL_TTL_MS = 60 * 60 * 1000

const seedUploadVariantKindValidator = v.union(
  v.literal('tile'),
  v.literal('preview')
)

const seedRunSummaryValidator = v.object({
  runId: v.string(),
  datasetKey: v.string(),
  releaseId: v.string(),
  status: seedReleaseStatusValidator,
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  startedBy: v.string(),
  templateCount: v.number(),
  itemCount: v.number(),
  imageVariantCount: v.number(),
  uploadedBytes: v.number(),
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
  templateId: v.string(),
  releaseId: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  category: templateCategoryValidator,
  tags: v.array(v.string()),
  visibility: templateVisibilityValidator,
  status: v.union(seedReleaseStatusValidator, v.null()),
  itemAspectRatio: v.union(v.number(), v.null()),
})

const seedResolvedItemValidator = v.object({
  templateExternalId: v.string(),
  itemExternalId: v.string(),
  itemId: v.string(),
  order: v.number(),
  label: v.union(v.string(), v.null()),
  mediaAssetId: v.union(v.string(), v.null()),
})

const seedResolvedCriterionValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  criterionId: v.string(),
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

const assertCountRange = (
  name: string,
  count: number,
  min: number,
  max: number
): void =>
{
  if (count < min || count > max)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${name} must include ${min}..${max} entries`,
    })
  }
}

const assertNonemptyString = (name: string, value: string): void =>
{
  if (value.trim().length === 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${name} must be nonempty`,
    })
  }
}

const assertNonnegativeInteger = (name: string, value: number): void =>
{
  if (!Number.isInteger(value) || value < 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${name} must be a nonnegative integer`,
    })
  }
}

const assertPositiveInteger = (name: string, value: number): void =>
{
  if (!Number.isInteger(value) || value < 1)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${name} must be a positive integer`,
    })
  }
}

const summarizeRun = (run: Doc<'seedRuns'>): SeedRunSummary => ({
  runId: run.runId,
  datasetKey: run.datasetKey,
  releaseId: run.releaseId,
  status: run.status,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  startedBy: run.startedBy,
  templateCount: run.templateCount,
  itemCount: run.itemCount,
  imageVariantCount: run.imageVariantCount,
  uploadedBytes: run.uploadedBytes,
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
  ctx: QueryCtx,
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

const loadSeedTemplate = async (
  ctx: QueryCtx,
  datasetKey: string,
  externalId: string
): Promise<Doc<'templates'> | null> =>
  await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedExternalId', externalId)
    )
    .unique()

const toResolvedTemplate = (
  template: Doc<'templates'>
): SeedResolvedTemplateRow => ({
  externalId: template.seedExternalId ?? '',
  templateId: template._id as string,
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
  externalIds: readonly string[]
): Promise<Map<string, Doc<'templates'>>> =>
{
  const entries = await Promise.all(
    externalIds.map(async (externalId) =>
    {
      const template = await loadSeedTemplate(ctx, datasetKey, externalId)
      return template ? ([externalId, template] as const) : null
    })
  )
  return new Map(
    entries.filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null
    )
  )
}

const resolveItems = async (
  ctx: QueryCtx,
  templates: ReadonlyMap<string, Doc<'templates'>>,
  keys: readonly { templateExternalId: string; itemExternalId: string }[]
): Promise<SeedResolvedItem[]> =>
{
  const rows = await Promise.all(
    keys.map(async (key) =>
    {
      const template = templates.get(key.templateExternalId)
      if (!template) return null
      const item = await ctx.db
        .query('templateItems')
        .withIndex('byTemplateAndExternalId', (q) =>
          q.eq('templateId', template._id).eq('externalId', key.itemExternalId)
        )
        .unique()
      if (!item) return null
      return {
        templateExternalId: key.templateExternalId,
        itemExternalId: key.itemExternalId,
        itemId: item._id as string,
        order: item.order,
        label: item.label,
        mediaAssetId: item.mediaAssetId as string | null,
      }
    })
  )
  return rows.filter((row): row is SeedResolvedItem => row !== null)
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
      criterionId: `${template._id}:${criterion.externalId}`,
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
  if (!authorId) return []
  const seen = new Set<string>()
  const resolved: SeedResolvedMedia[] = []
  for (const contentHash of variantHashes)
  {
    const variants = await ctx.db
      .query('mediaVariants')
      .withIndex('byContentHash', (q) => q.eq('contentHash', contentHash))
      .take(MAX_MEDIA_VARIANTS_PER_HASH)
    for (const variant of variants)
    {
      const media = await ctx.db.get(variant.mediaAssetId)
      if (!media || media.ownerId !== authorId) continue
      const key = `${contentHash}:${media._id}:${variant.kind}`
      if (seen.has(key)) continue
      seen.add(key)
      resolved.push({
        contentHash,
        mediaAssetId: media._id as string,
        variantKind: variant.kind,
        byteSize: variant.byteSize,
      })
    }
  }
  return resolved
}

const resolveActiveReleaseId = async (
  ctx: QueryCtx,
  datasetKey: string
): Promise<string | null> =>
{
  const activeRuns = await ctx.db
    .query('seedRuns')
    .withIndex('byDatasetStatusStartedAt', (q) =>
      q.eq('datasetKey', datasetKey).eq('status', 'active')
    )
    .order('desc')
    .take(1)
  return activeRuns[0]?.releaseId ?? null
}

const resolveAbsentFromManifest = async (
  ctx: QueryCtx,
  datasetKey: string,
  templateIds: ReadonlySet<string>,
  itemKeys: ReadonlyMap<string, ReadonlySet<string>>,
  criterionKeys: ReadonlyMap<string, ReadonlySet<string>>
): Promise<SeedRemovalCandidate[]> =>
{
  const templates = await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey)
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

const normalizeSeedVerifiedVariants = (
  variants: readonly VerifiedSeedVariant[]
): string =>
  variants
    .map((variant) => `${variant.kind}:${variant.contentHash}`)
    .sort()
    .join('|')

const validateSeedUploadedAsset = (asset: SeedUploadedMediaAssetArg): void =>
{
  assertNonemptyString('assetKey', asset.assetKey)
  if (asset.variants.length < 1 || asset.variants.length > 2)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'seed media asset must include 1..2 variants',
    })
  }
  const kinds = new Set<SeedUploadVariantKind>()
  for (const variant of asset.variants)
  {
    if (kinds.has(variant.kind))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `duplicate seed media variant kind: ${variant.kind}`,
      })
    }
    kinds.add(variant.kind)
    assertNonemptyString('contentHash', variant.contentHash)
    assertPositiveInteger('expectedByteSize', variant.expectedByteSize)
    assertPositiveInteger('expectedWidth', variant.expectedWidth)
    assertPositiveInteger('expectedHeight', variant.expectedHeight)
  }
  if (!kinds.has('tile'))
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'seed media asset finalization requires a tile variant',
    })
  }
}

const cleanupStorageIds = async (
  ctx: ActionCtx,
  storageIds: readonly Id<'_storage'>[]
): Promise<SeedCleanupResult> =>
{
  const cleanedStorageIds: string[] = []
  const missingStorageIds: string[] = []
  for (const storageId of storageIds)
  {
    const metadata = await ctx.runQuery(
      internal.lib.storage.getStorageMetadata,
      {
        storageId,
      }
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
  validateSeedUploadedAsset(asset)
  const verified: VerifiedSeedVariant[] = []
  const rejected: SeedRejectedUpload[] = []
  for (const upload of asset.variants)
  {
    const result = await loadVerifiedSeedVariant(ctx, asset.assetKey, upload)
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

  const dedupeHash = normalizeSeedVerifiedVariants(verified)
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

    const now = Date.now()
    const startedBy = await currentSeedActor(ctx)
    const runId = await ctx.db.insert('seedRuns', {
      runId: args.runId,
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      status: 'building',
      startedAt: now,
      finishedAt: null,
      startedBy,
      templateCount: args.templateCount,
      itemCount: args.itemCount,
      imageVariantCount: args.imageVariantCount,
      uploadedBytes: 0,
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

export const cleanupRejectedSeedUploads = action({
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
