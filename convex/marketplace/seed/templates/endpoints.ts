// convex/marketplace/seed/templates/endpoints.ts
// internal Convex API used by the Python seed HTTP endpoints

import { ConvexError, v } from 'convex/values'
import { modifyAccountCredentials } from '@convex-dev/auth/server'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { api, internal } from '../../../_generated/api'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import type {
  SeedActivateReleaseOutput,
  SeedBeginRunOutput,
  SeedCriterionUpsertOutput,
  SeedFinalizeUploadedMediaOutput,
  SeedGenerateUploadUrlsOutput,
  SeedRejectedUpload,
  SeedResolveMediaByHashesOutput,
  SeedRollbackReleaseOutput,
  SeedRunStatusOutput,
  SeedSyncTemplateItemsOutput,
  SeedSyncTemplateStyleItemsOutput,
  SeedTemplateCriterionKey,
  SeedTemplateItemKey,
  SeedTemplateStyle,
  SeedTemplateStyleItemKey,
  SeedTemplateUpsertOutput,
  SeedUploadUrl,
  SeedUploadVariantRequest,
  SeedVerifyReleaseOutput,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import {
  assertCountRange,
  assertNonemptyString,
  assertNonnegativeInteger,
  assertPositiveInteger,
  assertUniqueValues,
} from '../../../lib/assertions'
import {
  getItemTransformBoundsViolation,
  type ItemTransformBoundsViolation,
} from '@tierlistbuilder/contracts/workspace/board'
import { valuesEqual } from '../../../lib/equality'
import { validateHexColor } from '../../../lib/hexColor'
import { SEED_LIMITS, SEED_UPLOAD_URL_TTL_MS } from '../../../lib/limits'
import { seedContentHash } from '../../../lib/seedContentHash'
import {
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  createTemplateStats,
  patchTemplateAndSyncCard,
  syncTemplateTagRows,
  writeTemplateCard,
} from '../../templates/lib/writes'
import {
  buildDefaultTemplateCriteria,
  validateTemplateCriteria,
} from '../../templates/criteria'
import {
  validateImagePadding,
  validateNaturalAspectRatio,
} from '../../../lib/validators/common'
import { activateSeedReleaseInternal } from '../lib/activation'
import {
  appendExpectedTotalsDiagnostics,
  appendReleaseTemplateScopeDiagnostics,
  buildSeedReleaseDiagnosticsForTemplates,
} from '../lib/diagnostics'
import {
  buildSeedMediaAssetIdByDedupeHashCache,
  finalizeSeedMediaAsset,
  resolveSeedMediaAssetIdByDedupeHash,
} from '../lib/media'
import {
  resolveActiveReleaseIds,
  resolveCriteria,
  resolveItems,
  resolveMediaForAuthor,
  resolveTemplates,
  toResolvedTemplate,
} from '../lib/resolvers'
import {
  assertBatchSize,
  assertSeedCompiledTotals,
  assertSeedRunArgs,
  currentSeedActor,
  findSeedAuthorId,
  hasErrorDiagnostics,
  loadLatestSeedRunForRelease,
  loadSeedRunOrThrow,
  setSeedRunStatus,
  summarizeRun,
} from '../lib/runRecords'
import {
  groupByTemplateExternalId,
  buildSeedTemplateLifecycleFields,
  loadSeedTemplateLookupForRelease,
  normalizeSeedTemplateUpsert,
  patchSeedTemplateItemSummary,
  seedTemplateApplyGateChanged,
  toSeedCriterionKey,
  toSeedItemKey,
} from '../lib/templates'
import type {
  SeedCriterionUpsertArg,
  SeedFinalizedMediaRow,
  SeedItemUpsertArg,
  SeedResolveStateResult,
  SeedTemplateStyleItemUpsertArg,
  SeedTemplateUpsertArg,
} from '../lib/types'
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
  seedSyncTemplateStyleItemsOutputValidator,
  seedTemplateStyleItemUpsertValidator,
  seedRejectedUploadValidator,
  seedResolvedMediaValidator,
  seedRunSummaryValidator,
  seedTemplateUpsertOutputValidator,
  seedTemplateUpsertValidator,
  seedUploadUrlValidator,
  seedUploadVariantRequestValidator,
  seedUploadedMediaAssetValidator,
} from '../lib/validators'

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
      internal.marketplace.seed.templates.maintenance.getSeedUserStatusImpl,
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
    assertSeedRunArgs(args)
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
  handler: async (ctx, args): Promise<SeedGenerateUploadUrlsOutput> =>
  {
    assertSeedRunArgs(args)
    assertCountRange(
      'variants',
      args.variants.length,
      1,
      SEED_LIMITS.uploadUrlsPerCall
    )
    const variants = args.variants as SeedUploadVariantRequest[]
    const expiresAt = Date.now() + SEED_UPLOAD_URL_TTL_MS
    const urls: SeedUploadUrl[] = await Promise.all(
      variants.map(async (variant) =>
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
  handler: async (ctx, args): Promise<SeedFinalizeUploadedMediaOutput> =>
  {
    assertSeedRunArgs(args)
    assertNonemptyString('authorEmail', args.authorEmail)
    assertCountRange(
      'assets',
      args.assets.length,
      1,
      SEED_LIMITS.mediaAssetsPerFinalize
    )
    const authorId: Id<'users'> | null = await ctx.runQuery(
      internal.marketplace.seed.templates.endpoints.findSeedAuthorIdByEmail,
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
      internal.marketplace.seed.lib.storageUploads
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

const seedItemTransformBoundsMessage = (
  violation: ItemTransformBoundsViolation
): string =>
  violation.bound === 'range'
    ? `item.transform.${violation.field} must be within [${violation.min}, ${violation.max}]`
    : `item.transform.${violation.field} must be ${violation.bound === 'min' ? '>=' : '<='} ${violation.bound === 'min' ? violation.min : violation.max}`

const templateStyleItemsContentHash = async (
  templateExternalId: string,
  styleHashes: readonly {
    styleExternalId: string
    styleItemsContentHash: string
  }[]
): Promise<string> =>
  await seedContentHash('template-style-items-index', {
    templateExternalId,
    // code-point order to exactly mirror Python's sorted() in
    // template_style_items_content_hash -- localeCompare diverges on the hyphens
    // in kebab style ids & would mismatch the cross-language aggregate hash
    styles: [...styleHashes].sort((left, right) =>
      left.styleExternalId < right.styleExternalId
        ? -1
        : left.styleExternalId > right.styleExternalId
          ? 1
          : 0
    ),
  })

const patchTemplateStyleItemsContentHash = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  templateExternalId: string
): Promise<void> =>
{
  const styles = await ctx.db
    .query('templateStyles')
    .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
    .take(SEED_LIMITS.stylesPerTemplate + 1)
  if (styles.length > SEED_LIMITS.stylesPerTemplate)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed template style count exceeds apply limit',
    })
  }
  const styleHashes = styles
    .filter((style) => !style.isDefault)
    .map((style) => ({
      styleExternalId: style.externalId,
      styleItemsContentHash: style.seedItemsContentHash ?? null,
    }))
  const readyStyleHashes = styleHashes.flatMap((style) =>
    style.styleItemsContentHash === null
      ? []
      : [
          {
            styleExternalId: style.styleExternalId,
            styleItemsContentHash: style.styleItemsContentHash,
          },
        ]
  )
  const seedStyleItemsContentHash =
    styleHashes.length === 0 || readyStyleHashes.length !== styleHashes.length
      ? null
      : await templateStyleItemsContentHash(
          templateExternalId,
          readyStyleHashes
        )
  if (
    (template.seedStyleItemsContentHash ?? null) !== seedStyleItemsContentHash
  )
  {
    await ctx.db.patch(template._id, { seedStyleItemsContentHash })
  }
}

const deleteSeedTemplateStyleItemRows = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  styleExternalId: string
): Promise<void> =>
{
  const rows = await ctx.db
    .query('templateItemStyleAssets')
    .withIndex('byTemplateStyleAndItem', (q) =>
      q.eq('templateId', templateId).eq('styleExternalId', styleExternalId)
    )
    .take(SEED_LIMITS.itemsPerTemplate + 1)
  if (rows.length > SEED_LIMITS.itemsPerTemplate)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed style asset count exceeds apply limit',
    })
  }
  await Promise.all(rows.map((row) => ctx.db.delete(row._id)))
}

// upsert the per-template image style (skin) rows & prune any dropped style.
// the default style's per-item images stay on templateItems; non-default style
// item assets sync separately via syncSeedTemplateStyleItems
const syncSeedTemplateStyleRows = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  templateExternalId: string,
  datasetKey: string,
  releaseId: string,
  styles: readonly SeedTemplateStyle[],
  mediaAssetCache: ReadonlyMap<string, Id<'mediaAssets'>>,
  now: number
): Promise<void> =>
{
  // exactly-one-default is a hard invariant the resolver + picker depend on &
  // can't be expressed in the schema -- enforce it server-side, not just in the
  // Python source validator (defense-in-depth: a malformed payload must reject)
  if (styles.length > 0)
  {
    const defaultStyles = styles.filter((style) => style.isDefault)
    if (defaultStyles.length !== 1)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `seed template ${templateExternalId} must have exactly one default style, found ${defaultStyles.length}`,
      })
    }
    if (template.defaultStyleId !== defaultStyles[0].externalId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `seed template ${templateExternalId} defaultStyleId "${template.defaultStyleId}" does not name its default style "${defaultStyles[0].externalId}"`,
      })
    }
  }
  else if (template.defaultStyleId !== null)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `seed template ${templateExternalId} has no styles but defaultStyleId is set`,
    })
  }
  assertUniqueValues(
    'seed template style externalId',
    styles.map((style) => style.externalId)
  )

  const existing = await ctx.db
    .query('templateStyles')
    .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
    .take(SEED_LIMITS.stylesPerTemplate + 1)
  if (existing.length > SEED_LIMITS.stylesPerTemplate)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed template style count exceeds apply limit',
    })
  }
  const existingByExternalId = new Map(
    existing.map((style) => [style.externalId, style])
  )
  const seen = new Set<string>()
  for (const style of styles)
  {
    assertNonemptyString('styleExternalId', style.externalId)
    seen.add(style.externalId)
    const coverMediaAssetId = style.coverMediaDedupeHash
      ? resolveSeedMediaAssetIdByDedupeHash(
          mediaAssetCache,
          style.coverMediaDedupeHash
        )
      : null
    const fields = {
      label: style.label,
      order: style.order,
      isDefault: style.isDefault,
      coverMediaAssetId,
      coverFraming: null,
      itemAspectRatio: style.itemAspectRatio,
      itemAspectRatioMode: 'manual' as const,
      defaultItemImageFit: null,
      defaultItemImagePadding: style.defaultItemImagePadding,
      labels: style.labels ?? null,
      autoPlate: style.autoPlate,
      seedDatasetKey: datasetKey,
      seedReleaseId: releaseId,
      updatedAt: now,
    }
    const row = existingByExternalId.get(style.externalId)
    if (!row)
    {
      await ctx.db.insert('templateStyles', {
        templateId: template._id,
        externalId: style.externalId,
        ...fields,
        seedItemsContentHash: null,
        createdAt: now,
      })
    }
    else
    {
      await ctx.db.patch(row._id, fields)
    }
  }
  await Promise.all(
    existing
      .filter((style) => !seen.has(style.externalId))
      .map(async (style) =>
      {
        await deleteSeedTemplateStyleItemRows(
          ctx,
          template._id,
          style.externalId
        )
        await ctx.db.delete(style._id)
      })
  )
  await patchTemplateStyleItemsContentHash(ctx, template, templateExternalId)
}

export const upsertSeedTemplates = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    authorEmail: v.string(),
    templates: v.array(seedTemplateUpsertValidator),
  },
  returns: seedTemplateUpsertOutputValidator,
  handler: async (ctx, args): Promise<SeedTemplateUpsertOutput> =>
  {
    assertSeedRunArgs(args)
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
    // style cover media resolves through the same author-scoped cache
    const styleCoverDedupeHashes = (args.templates as SeedTemplateUpsertArg[])
      .flatMap((template) => template.styles ?? [])
      .map((style) => style.coverMediaDedupeHash)
      .filter((hash): hash is string => hash !== null)
    const mediaAssetCache = await buildSeedMediaAssetIdByDedupeHashCache(
      ctx,
      authorId,
      [...coverDedupeHashes, ...styleCoverDedupeHashes]
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
    // one timestamp for the whole batch so every template upserted in this call
    // shares a consistent createdAt/updatedAt
    const now = Date.now()
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
          defaultItemImagePadding: patch.defaultItemImagePadding,
          defaultStyleId: patch.defaultStyleId,
          labels: patch.labels,
          autoPlate: patch.autoPlate,
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
        await syncSeedTemplateStyleRows(
          ctx,
          row,
          template.externalId,
          args.datasetKey,
          args.releaseId,
          template.styles ?? [],
          mediaAssetCache,
          now
        )
        created.push(template.externalId)
        continue
      }

      if (!seedTemplateApplyGateChanged(existing, patch))
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
      await syncSeedTemplateStyleRows(
        ctx,
        nextTemplate,
        template.externalId,
        args.datasetKey,
        args.releaseId,
        template.styles ?? [],
        mediaAssetCache,
        now
      )
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
  handler: async (ctx, args): Promise<SeedSyncTemplateItemsOutput> =>
  {
    assertSeedRunArgs(args)
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
        validateNaturalAspectRatio(item.aspectRatio, 'aspectRatio')
      }
      if (item.backgroundColor !== null)
      {
        validateHexColor(item.backgroundColor, 'item.backgroundColor')
      }
      if (item.imagePadding !== null)
      {
        validateImagePadding(item.imagePadding, 'item.imagePadding')
      }
      if (item.transform !== null)
      {
        const violation = getItemTransformBoundsViolation(item.transform)
        if (violation)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message: seedItemTransformBoundsMessage(violation),
          })
        }
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
        backgroundColor: item.backgroundColor ?? null,
        mediaPlate: item.mediaPlate ?? null,
        altText: item.label,
        mediaAssetId,
        order: item.order,
        aspectRatio: item.aspectRatio,
        imageFit: null,
        transform: item.transform,
        imagePadding: item.imagePadding,
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
        (existing.backgroundColor ?? null) !== fields.backgroundColor ||
        (existing.mediaPlate ?? null) !== fields.mediaPlate ||
        existing.imagePadding !== fields.imagePadding ||
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

export const syncSeedTemplateStyleItems = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    templateExternalId: v.string(),
    styleExternalId: v.string(),
    styleItemsContentHash: v.string(),
    allowContentHashSkip: v.optional(v.boolean()),
    items: v.array(seedTemplateStyleItemUpsertValidator),
  },
  returns: seedSyncTemplateStyleItemsOutputValidator,
  handler: async (ctx, args): Promise<SeedSyncTemplateStyleItemsOutput> =>
  {
    assertSeedRunArgs(args)
    assertNonemptyString('templateExternalId', args.templateExternalId)
    assertNonemptyString('styleExternalId', args.styleExternalId)
    assertNonemptyString('styleItemsContentHash', args.styleItemsContentHash)
    assertCountRange(
      'items',
      args.items.length,
      1,
      SEED_LIMITS.styleItemUpsertsPerCall
    )
    assertUniqueValues(
      'seed style item key',
      args.items.map((item) => item.itemExternalId)
    )

    const created: SeedTemplateStyleItemKey[] = []
    const updated: SeedTemplateStyleItemKey[] = []
    const unchanged: SeedTemplateStyleItemKey[] = []
    const deleted: SeedTemplateStyleItemKey[] = []

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
    const styleRow = await ctx.db
      .query('templateStyles')
      .withIndex('byTemplateAndExternalId', (q) =>
        q.eq('templateId', template._id).eq('externalId', args.styleExternalId)
      )
      .unique()
    if (!styleRow || styleRow.isDefault)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed template style not found: ${args.styleExternalId}`,
      })
    }
    // content-hash skip gate (mirrors syncSeedTemplateItems): an unchanged skin
    // re-applies as a no-op instead of re-reading & field-comparing every row
    if (
      args.allowContentHashSkip === true &&
      styleRow.seedItemsContentHash === args.styleItemsContentHash
    )
    {
      unchanged.push(
        ...(args.items as SeedTemplateStyleItemUpsertArg[]).map((item) => ({
          templateExternalId: args.templateExternalId,
          styleExternalId: args.styleExternalId,
          itemExternalId: item.itemExternalId,
        }))
      )
      return { created, updated, unchanged, deleted }
    }

    // resolve item externalId -> templateItemId (the style asset's join key)
    const templateItems = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
      .take(SEED_LIMITS.itemsPerTemplate + 1)
    if (templateItems.length > SEED_LIMITS.itemsPerTemplate)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'seed template item count exceeds apply limit',
      })
    }
    const templateItemIdByExternalId = new Map(
      templateItems.map((item) => [item.externalId, item._id])
    )

    const styleMediaCache = await buildSeedMediaAssetIdByDedupeHashCache(
      ctx,
      template.authorId,
      (args.items as SeedTemplateStyleItemUpsertArg[])
        .map((item) => item.mediaDedupeHash)
        .filter((hash): hash is string => hash !== null)
    )
    const existingRows = await ctx.db
      .query('templateItemStyleAssets')
      .withIndex('byTemplateStyleAndItem', (q) =>
        q
          .eq('templateId', template._id)
          .eq('styleExternalId', args.styleExternalId)
      )
      .take(SEED_LIMITS.itemsPerTemplate + 1)
    if (existingRows.length > SEED_LIMITS.itemsPerTemplate)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'seed style asset count exceeds apply limit',
      })
    }
    const existingByItemExternalId = new Map(
      existingRows.map((row) => [row.itemExternalId, row])
    )

    const seen = new Set<string>()
    for (const item of args.items as SeedTemplateStyleItemUpsertArg[])
    {
      assertNonemptyString('itemExternalId', item.itemExternalId)
      if (item.aspectRatio !== null)
      {
        validateNaturalAspectRatio(item.aspectRatio, 'aspectRatio')
      }
      if (item.imagePadding !== null)
      {
        validateImagePadding(item.imagePadding, 'item.imagePadding')
      }
      if (item.transform !== null)
      {
        const violation = getItemTransformBoundsViolation(item.transform)
        if (violation)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidInput,
            message: seedItemTransformBoundsMessage(violation),
          })
        }
      }
      const templateItemId = templateItemIdByExternalId.get(item.itemExternalId)
      if (!templateItemId)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.notFound,
          message: `seed style item references unknown template item: ${item.itemExternalId}`,
        })
      }
      seen.add(item.itemExternalId)
      const key: SeedTemplateStyleItemKey = {
        templateExternalId: args.templateExternalId,
        styleExternalId: args.styleExternalId,
        itemExternalId: item.itemExternalId,
      }
      const mediaAssetId = item.mediaDedupeHash
        ? resolveSeedMediaAssetIdByDedupeHash(
            styleMediaCache,
            item.mediaDedupeHash
          )
        : null
      const fields = {
        templateItemId,
        mediaAssetId,
        aspectRatio: item.aspectRatio,
        imageFit: null,
        transform: item.transform,
        mediaPlate: item.mediaPlate ?? null,
        imagePadding: item.imagePadding,
        altText: null,
      }
      const existing = existingByItemExternalId.get(item.itemExternalId) ?? null
      if (!existing)
      {
        await ctx.db.insert('templateItemStyleAssets', {
          templateId: template._id,
          styleExternalId: args.styleExternalId,
          itemExternalId: item.itemExternalId,
          ...fields,
        })
        created.push(key)
        continue
      }
      const contentChanged =
        existing.templateItemId !== fields.templateItemId ||
        existing.mediaAssetId !== fields.mediaAssetId ||
        existing.aspectRatio !== fields.aspectRatio ||
        existing.imageFit !== fields.imageFit ||
        (existing.mediaPlate ?? null) !== fields.mediaPlate ||
        existing.imagePadding !== fields.imagePadding ||
        !valuesEqual(existing.transform, fields.transform)
      if (!contentChanged)
      {
        unchanged.push(key)
        continue
      }
      await ctx.db.patch(existing._id, fields)
      updated.push(key)
    }

    const rowsToDelete = existingRows.filter(
      (row) => !seen.has(row.itemExternalId)
    )
    await Promise.all(rowsToDelete.map((row) => ctx.db.delete(row._id)))
    deleted.push(
      ...rowsToDelete.map((row) => ({
        templateExternalId: args.templateExternalId,
        styleExternalId: args.styleExternalId,
        itemExternalId: row.itemExternalId,
      }))
    )
    if (
      created.length > 0 ||
      updated.length > 0 ||
      deleted.length > 0 ||
      styleRow.seedItemsContentHash !== args.styleItemsContentHash
    )
    {
      await ctx.db.patch(styleRow._id, {
        seedItemsContentHash: args.styleItemsContentHash,
        updatedAt: Date.now(),
      })
    }
    await patchTemplateStyleItemsContentHash(
      ctx,
      template,
      args.templateExternalId
    )
    return { created, updated, unchanged, deleted }
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
  handler: async (ctx, args): Promise<SeedCriterionUpsertOutput> =>
  {
    assertSeedRunArgs(args)
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
    assertSeedRunArgs(args)
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
  handler: async (ctx, args): Promise<SeedVerifyReleaseOutput> =>
  {
    assertSeedRunArgs(args)
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
    // Re-verify of active release must not demote its run record.
    // Only transition pre-activation runs.
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
    assertSeedRunArgs(args)
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
    assertSeedRunArgs(args)
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
  handler: async (ctx, args): Promise<SeedResolveMediaByHashesOutput> =>
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
  handler: async (ctx, args): Promise<SeedRunStatusOutput> =>
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
