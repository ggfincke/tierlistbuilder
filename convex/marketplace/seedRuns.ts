// convex/marketplace/seedRuns.ts
// public Convex API for the Python seed pipeline. private logic lives under
// ./seedPipeline/ (validators, resolvers, media, templates, diagnostics, ...)

import { ConvexError, v } from 'convex/values'
import { action, internalQuery, mutation, query } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { internal } from '../_generated/api'
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
import { requireSeedAuthorized } from './seedAuth'
import { activateSeedReleaseInternal } from './seedPipeline/activation'
import { buildSeedReleaseDiagnostics } from './seedPipeline/diagnostics'
import {
  buildSeedMediaAssetIdCache,
  cleanupStorageIds,
  finalizeSeedMediaAsset,
  resolveSeedMediaAssetIdFromCache,
} from './seedPipeline/media'
import {
  keySetByTemplate,
  resolveActiveReleaseId,
  resolveCriteria,
  resolveItems,
  resolveMediaForAuthor,
  resolveTemplates,
  resolveAbsentFromManifest,
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
  loadSeedTemplateLookupForRelease,
  normalizeSeedTemplateUpsert,
  patchSeedTemplateItemSummary,
  templatePatchChanged,
  toSeedCriterionKey,
  toSeedItemKey,
} from './seedPipeline/templates'
import type {
  SeedCleanupResult,
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
  seedCleanupOutputValidator,
  seedCompiledTotalsValidator,
  seedCriterionUpsertOutputValidator,
  seedCriterionUpsertValidator,
  seedDiagnosticValidator,
  seedFinalizedMediaValidator,
  seedItemUpsertOutputValidator,
  seedItemUpsertValidator,
  seedRejectedUploadValidator,
  seedResolvedMediaValidator,
  seedRunSummaryValidator,
  seedTemplateUpsertOutputValidator,
  seedTemplateUpsertValidator,
  seedUploadUrlValidator,
  seedUploadVariantRequestValidator,
  seedUploadedMediaAssetValidator,
} from './seedPipeline/validators'

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
      SEED_LIMITS.storageIdsPerCleanup
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
      SEED_LIMITS.itemUpsertsPerCall
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
        .take(SEED_LIMITS.itemsPerTemplate)
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
  handler: async (ctx, args) =>
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
