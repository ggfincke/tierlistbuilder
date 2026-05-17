// convex/marketplace/seedRuns.ts
// internal Convex API used by the Python seed HTTP endpoints

import { ConvexError, v } from 'convex/values'
import { modifyAccountCredentials } from '@convex-dev/auth/server'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { api, internal } from '../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import type {
  SeedActivateReleaseOutput,
  SeedBeginRunOutput,
  SeedRejectedUpload,
  SeedResolvedMedia,
  SeedRollbackReleaseOutput,
  SeedRunSummary,
  SeedTemplateCriterionKey,
  SeedTemplateItemKey,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
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
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  createTemplateStats,
  patchTemplateAndSyncCard,
  syncTemplateTagRows,
  writeTemplateCard,
} from './templates/lib'
import {
  buildDefaultTemplateCriteria,
  validateTemplateCriteria,
} from './templates/criteria'
import { activateSeedReleaseInternal } from './seedPipeline/activation'
import {
  appendExpectedTotalsDiagnostics,
  appendReleaseTemplateScopeDiagnostics,
  buildSeedReleaseDiagnosticsForTemplates,
} from './seedPipeline/diagnostics'
import {
  buildSeedMediaAssetIdByDedupeHashCache,
  finalizeSeedMediaAsset,
  resolveSeedMediaAssetIdByDedupeHash,
} from './seedPipeline/media'
import {
  resolveActiveReleaseIds,
  resolveCriteria,
  resolveItems,
  resolveMediaForAuthor,
  resolveTemplates,
  toResolvedTemplate,
} from './seedPipeline/resolvers'
import {
  assertBatchSize,
  assertSeedCompiledTotals,
  currentSeedActor,
  findSeedAuthorId,
  hasErrorDiagnostics,
  loadLatestSeedRunForRelease,
  loadSeedRunOrThrow,
  setSeedRunStatus,
  summarizeRun,
} from './seedPipeline/runs'
import {
  groupByTemplateExternalId,
  buildSeedTemplateLifecycleFields,
  loadSeedTemplateLookupForRelease,
  normalizeSeedTemplateUpsert,
  patchSeedTemplateItemSummary,
  templatePatchChanged,
  toSeedCriterionKey,
  toSeedItemKey,
} from './seedPipeline/templates'
import type {
  SeedCriterionUpsertArg,
  SeedFinalizedMediaRow,
  SeedItemUpsertArg,
  SeedResolveStateResult,
  SeedTemplateUpsertArg,
  SeedUploadUrlRow,
} from './seedPipeline/types'
import {
  resolveStateArgsValidator,
  resolveStateOutputValidator,
  seedCompiledTotalsValidator,
  seedCriterionUpsertOutputValidator,
  seedCriterionUpsertValidator,
  seedDiagnosticValidator,
  seedFinalizedMediaValidator,
  seedItemUpsertValidator,
  seedSyncTemplateItemsOutputValidator,
  seedRejectedUploadValidator,
  seedResolvedMediaValidator,
  seedRunSummaryValidator,
  seedTemplateUpsertOutputValidator,
  seedTemplateUpsertValidator,
  seedUploadUrlValidator,
  seedUploadVariantRequestValidator,
  seedUploadedMediaAssetValidator,
} from './seedPipeline/validators'

const seedReleaseDiagnosticTotalsValidator = v.object({
  templateCount: v.number(),
  itemCount: v.number(),
  criterionCount: v.number(),
})

const pushPublicTemplateTransition = (
  deltas: { category: Doc<'templates'>['category']; delta: number }[],
  previous: Pick<Doc<'templates'>, 'category' | 'isPubliclyListable'> | null,
  next: Pick<Doc<'templates'>, 'category' | 'isPubliclyListable'>
): void =>
{
  if (
    previous?.isPubliclyListable &&
    next.isPubliclyListable &&
    previous.category === next.category
  )
  {
    return
  }
  if (previous?.isPubliclyListable)
  {
    deltas.push({ category: previous.category, delta: -1 })
  }
  if (next.isPubliclyListable)
  {
    deltas.push({ category: next.category, delta: 1 })
  }
}

export const findSeedAuthorIdByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.id('users'), v.null()),
  handler: async (ctx, args): Promise<Id<'users'> | null> =>
    await findSeedAuthorId(ctx, args.email),
})

export const ensureSeedAuthor = internalAction({
  args: { email: v.string(), password: v.string() },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args): Promise<{ created: boolean }> =>
  {
    assertNonemptyString('email', args.email)
    assertNonemptyString('password', args.password)
    const existing = await ctx.runQuery(
      internal.marketplace.templates.seed.getSeedUserStatusImpl,
      { email: args.email }
    )
    if (existing.accountExists)
    {
      // re-assert the seed-author password so a rotated seedAuthorPassword env
      // var produces a working account w/o manual reset. seeds are
      // idempotent & the secret only ever comes from server-side env
      await modifyAccountCredentials(ctx, {
        provider: 'password',
        account: { id: args.email, secret: args.password },
      })
      return { created: false }
    }
    await ctx.runAction(api.auth.signIn, {
      provider: 'password',
      params: {
        email: args.email,
        password: args.password,
        flow: 'signUp',
      },
    })
    return { created: true }
  },
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

export const beginSeedRun = internalMutation({
  args: {
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

export const generateSeedUploadUrls = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    variants: v.array(seedUploadVariantRequestValidator),
  },
  returns: v.object({ urls: v.array(seedUploadUrlValidator) }),
  handler: async (ctx, args): Promise<{ urls: SeedUploadUrlRow[] }> =>
  {
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertCountRange(
      'variants',
      args.variants.length,
      1,
      SEED_LIMITS.uploadUrlsPerCall
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

export const finalizeSeedUploadedMedia = internalAction({
  args: {
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('authorEmail', args.authorEmail)
    assertCountRange(
      'assets',
      args.assets.length,
      1,
      SEED_LIMITS.mediaAssetsPerFinalize
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
    await ctx.runMutation(
      internal.marketplace.seedPipeline.storageUploads
        .markSeedUploadedStorageIdsResolved,
      {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        runId: args.runId,
        storageIds: args.assets.flatMap((asset) =>
          asset.variants.map((variant) => variant.storageId)
        ),
      }
    )
    return { finalized, rejected }
  },
})

export const upsertSeedTemplates = internalMutation({
  args: {
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('authorEmail', args.authorEmail)
    assertCountRange(
      'templates',
      args.templates.length,
      1,
      SEED_LIMITS.templateUpsertsPerCall
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
    const publicTemplateDeltas: {
      category: Doc<'templates'>['category']
      delta: number
    }[] = []
    // batch all cover-media & existing-template lookups up-front so per-template
    // work skips repeated index probes & stays under the per-mutation read cap
    const coverDedupeHashes = (args.templates as SeedTemplateUpsertArg[])
      .map((template) => template.coverMediaDedupeHash)
      .filter((hash): hash is string => hash !== null)
    const mediaAssetCache = await buildSeedMediaAssetIdByDedupeHashCache(
      ctx,
      authorId,
      coverDedupeHashes
    )
    const { byExternalId: existingByExternalId } =
      await loadSeedTemplateLookupForRelease(
        ctx,
        args.datasetKey,
        args.releaseId
      )
    const activeReleaseIdsForDataset = await resolveActiveReleaseIds(
      ctx,
      args.datasetKey
    )
    const releaseIsActive = activeReleaseIdsForDataset.includes(args.releaseId)
    for (const template of args.templates as SeedTemplateUpsertArg[])
    {
      const existing = existingByExternalId.get(template.externalId) ?? null
      const patch = normalizeSeedTemplateUpsert(
        args.datasetKey,
        args.releaseId,
        template,
        mediaAssetCache,
        releaseIsActive || existing?.seedReleaseStatus === 'active'
      )
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
          labels: patch.labels,
          seedDatasetKey: args.datasetKey,
          seedExternalId: template.externalId,
          seedReleaseId: args.releaseId,
          seedReleaseStatus: patch.seedReleaseStatus,
          seedMetadataContentHash: patch.seedMetadataContentHash,
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
        pushPublicTemplateTransition(publicTemplateDeltas, null, row)
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
      pushPublicTemplateTransition(publicTemplateDeltas, existing, nextTemplate)
      updated.push(template.externalId)
    }
    await adjustPublicTemplateCount(ctx, publicTemplateDeltas)
    return { created, updated, unchanged }
  },
})

export const syncSeedTemplateItems = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    templateExternalId: v.string(),
    itemsContentHash: v.string(),
    allowContentHashSkip: v.optional(v.boolean()),
    items: v.array(seedItemUpsertValidator),
  },
  returns: seedSyncTemplateItemsOutputValidator,
  handler: async (
    ctx,
    args
  ): Promise<{
    created: SeedTemplateItemKey[]
    updated: SeedTemplateItemKey[]
    moved: SeedTemplateItemKey[]
    unchanged: SeedTemplateItemKey[]
    deleted: SeedTemplateItemKey[]
  }> =>
  {
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('templateExternalId', args.templateExternalId)
    assertNonemptyString('itemsContentHash', args.itemsContentHash)
    assertCountRange(
      'items',
      args.items.length,
      1,
      SEED_LIMITS.itemUpsertsPerCall
    )
    assertUniqueValues(
      'seed item key',
      args.items.map((item) => item.itemExternalId)
    )

    const created: SeedTemplateItemKey[] = []
    const updated: SeedTemplateItemKey[] = []
    const moved: SeedTemplateItemKey[] = []
    const unchanged: SeedTemplateItemKey[] = []
    const deleted: SeedTemplateItemKey[] = []
    const { byExternalId: templatesByExternalId } =
      await loadSeedTemplateLookupForRelease(
        ctx,
        args.datasetKey,
        args.releaseId
      )
    const template = templatesByExternalId.get(args.templateExternalId)
    if (!template)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed template not found: ${args.templateExternalId}`,
      })
    }
    if (args.items.length !== template.itemCount)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `seed template item sync for ${args.templateExternalId} expected ${template.itemCount} items, received ${args.items.length}`,
      })
    }
    if (
      args.allowContentHashSkip === true &&
      template.seedItemsContentHash === args.itemsContentHash
    )
    {
      unchanged.push(
        ...(args.items as SeedItemUpsertArg[]).map((item) =>
          toSeedItemKey({
            templateExternalId: args.templateExternalId,
            itemExternalId: item.itemExternalId,
          })
        )
      )
      return { created, updated, moved, unchanged, deleted }
    }

    const itemMediaCache = await buildSeedMediaAssetIdByDedupeHashCache(
      ctx,
      template.authorId,
      (args.items as SeedItemUpsertArg[]).map((item) => item.mediaDedupeHash)
    )
    const existingItems = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
      .take(SEED_LIMITS.itemsPerTemplate + 1)
    if (existingItems.length > SEED_LIMITS.itemsPerTemplate)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'seed template item count exceeds apply limit',
      })
    }
    const existingByExternalId = new Map(
      existingItems.map((item) => [item.externalId, item])
    )
    const seen = new Set<string>()
    for (const item of args.items as SeedItemUpsertArg[])
    {
      assertNonemptyString('itemExternalId', item.itemExternalId)
      assertNonnegativeInteger('order', item.order)
      if (item.aspectRatio !== null)
      {
        assertPositiveFinite('aspectRatio', item.aspectRatio)
      }
      seen.add(item.itemExternalId)
      const key = toSeedItemKey({
        templateExternalId: args.templateExternalId,
        itemExternalId: item.itemExternalId,
      })
      const mediaAssetId = resolveSeedMediaAssetIdByDedupeHash(
        itemMediaCache,
        item.mediaDedupeHash
      )
      const existing = existingByExternalId.get(item.itemExternalId) ?? null
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

    const rowsToDelete = existingItems.filter(
      (item) => !seen.has(item.externalId)
    )
    await Promise.all(rowsToDelete.map((item) => ctx.db.delete(item._id)))
    deleted.push(
      ...rowsToDelete.map((item) =>
        toSeedItemKey({
          templateExternalId: args.templateExternalId,
          itemExternalId: item.externalId,
        })
      )
    )
    if (
      created.length > 0 ||
      updated.length > 0 ||
      moved.length > 0 ||
      deleted.length > 0 ||
      template.seedItemsContentHash !== args.itemsContentHash
    )
    {
      await patchSeedTemplateItemSummary(ctx, template, {
        seedItemsContentHash: args.itemsContentHash,
      })
    }
    return { created, updated, moved, unchanged, deleted }
  },
})

export const upsertSeedCriteria = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    forceTemplateExternalIds: v.optional(v.array(v.string())),
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertCountRange(
      'criteria',
      args.criteria.length,
      1,
      SEED_LIMITS.criterionUpsertsPerCall
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
    const forceTemplateExternalIds = new Set(
      args.forceTemplateExternalIds ?? []
    )
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
      const criteriaContentHashes = new Set(
        criteria.map((criterion) => criterion.criteriaContentHash)
      )
      if (criteriaContentHashes.size !== 1)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidInput,
          message: `seed criteria content hash mismatch: ${templateExternalId}`,
        })
      }
      const criteriaContentHash = criteria[0]?.criteriaContentHash ?? ''
      assertNonemptyString('criteriaContentHash', criteriaContentHash)
      const template = templatesByExternalId.get(templateExternalId)
      if (!template)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `seed template not found: ${templateExternalId}`,
        })
      }
      if (
        !forceTemplateExternalIds.has(templateExternalId) &&
        template.seedCriteriaContentHash === criteriaContentHash
      )
      {
        unchanged.push(
          ...criteria.map((criterion) => toSeedCriterionKey(criterion))
        )
        continue
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
        if (template.seedCriteriaContentHash !== criteriaContentHash)
        {
          await ctx.db.patch(template._id, {
            seedCriteriaContentHash: criteriaContentHash,
            updatedAt: Date.now(),
          })
        }
        continue
      }
      await ctx.db.patch(template._id, {
        criteria: normalized,
        ...buildSeedTemplateLifecycleFields(
          template.itemCount,
          template.visibility,
          template.seedReleaseStatus === 'active'
        ),
        seedCriteriaContentHash: criteriaContentHash,
        updatedAt: Date.now(),
      })
    }
    return { created, updated, unchanged, deactivated }
  },
})

export const verifySeedReleaseChunk = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    templateExternalIds: v.array(v.string()),
  },
  returns: v.object({
    diagnostics: v.array(seedDiagnosticValidator),
    totals: seedReleaseDiagnosticTotalsValidator,
  }),
  handler: async (ctx, args) =>
  {
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertBatchSize('templateExternalIds', args.templateExternalIds.length)
    await loadSeedRunOrThrow(ctx, args.datasetKey, args.releaseId, args.runId)
    return await buildSeedReleaseDiagnosticsForTemplates(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.templateExternalIds
    )
  },
})

export const completeSeedReleaseVerification = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    expectedTotals: seedCompiledTotalsValidator,
    actualTotals: seedReleaseDiagnosticTotalsValidator,
    diagnostics: v.array(seedDiagnosticValidator),
  },
  returns: v.object({
    verified: v.boolean(),
    diagnostics: v.array(seedDiagnosticValidator),
  }),
  handler: async (ctx, args) =>
  {
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
    const diagnostics = [...args.diagnostics]
    appendExpectedTotalsDiagnostics(
      diagnostics,
      args.actualTotals,
      args.expectedTotals
    )
    await appendReleaseTemplateScopeDiagnostics(
      ctx,
      diagnostics,
      args.datasetKey,
      args.releaseId,
      args.expectedTotals
    )
    const verified = !hasErrorDiagnostics(diagnostics)
    // a re-verify of an already-active release shouldn't demote its run record
    // back to 'verified' or 'failed' — those would mis-report the release as
    // not-yet-active. only transition pre-activation runs
    if (run.status !== 'active')
    {
      await setSeedRunStatus(
        ctx,
        run,
        verified ? 'verified' : 'failed',
        verified
          ? null
          : `seed verification failed: ${diagnostics.length} diagnostics`
      )
    }
    return { verified, diagnostics }
  },
})

export const activateSeedRelease = internalMutation({
  args: {
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

export const rollbackSeedRelease = internalMutation({
  args: {
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
    const activeReleaseIds = await resolveActiveReleaseIds(ctx, args.datasetKey)
    if (
      activeReleaseIds.includes(args.targetReleaseId) &&
      !activeReleaseIds.includes(args.releaseId)
    )
    {
      await setSeedRunStatus(ctx, run, 'rolled_back')
      return {
        activeReleaseId: args.targetReleaseId,
        rolledBackReleaseId: args.releaseId,
      }
    }
    if (!activeReleaseIds.includes(args.releaseId))
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

export const resolveSeedMediaByHashes = internalQuery({
  args: {
    authorEmail: v.string(),
    variantHashes: v.array(v.string()),
  },
  returns: v.object({ media: v.array(seedResolvedMediaValidator) }),
  handler: async (ctx, args): Promise<{ media: SeedResolvedMedia[] }> =>
  {
    assertBatchSize('variantHashes', args.variantHashes.length)
    const authorId = await findSeedAuthorId(ctx, args.authorEmail)
    return {
      media: await resolveMediaForAuthor(ctx, authorId, args.variantHashes),
    }
  },
})

export const resolveSeedState = internalQuery({
  args: resolveStateArgsValidator,
  returns: resolveStateOutputValidator,
  handler: async (ctx, args): Promise<SeedResolveStateResult> =>
  {
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
    const [items, media, activeReleaseIds] = await Promise.all([
      resolveItems(ctx, templates, args.itemExternalIds),
      resolveMediaForAuthor(ctx, authorId, args.variantHashes),
      resolveActiveReleaseIds(ctx, args.datasetKey),
    ])

    return {
      activeReleaseId: activeReleaseIds[0] ?? null,
      templates: [...templates.values()].map(toResolvedTemplate),
      items,
      criteria: resolveCriteria(templates, args.criterionExternalIds),
      media,
    }
  },
})

export const getSeedRunStatus = internalQuery({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
  },
  returns: v.object({ run: v.union(seedRunSummaryValidator, v.null()) }),
  handler: async (ctx, args): Promise<{ run: SeedRunSummary | null }> =>
  {
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
