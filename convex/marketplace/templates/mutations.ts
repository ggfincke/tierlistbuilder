// convex/marketplace/templates/mutations.ts
// template marketplace mutations for publishing, managing, & cloning templates

import { ConvexError, v } from 'convex/values'
import { mutation, type MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { generateBoardId } from '@tierlistbuilder/contracts/lib/ids'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  ACTIVE_TEMPLATE_JOB_STATUSES,
  COVER_SURFACES,
  MAX_TEMPLATE_COVER_ITEMS,
  isFinishedTemplateJobStatus,
  isTemplateSlug,
  isValidCoverFrame,
  type CoverFrame,
  type MarketplaceTemplatePublishResult,
  type MarketplaceTemplateUseResult,
  type TemplateCoverFraming,
  type TemplateUseTierSelection,
} from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_STANDARD_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { getCurrentUserId, requireCurrentUserId } from '../../lib/auth'
import { enforceRateLimit } from '../../lib/rateLimiter'
import {
  assertCanPublishTemplate,
  assertCanUseTemplate,
} from '../../lib/entitlements'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import { failInput } from '../../lib/text'
import {
  findOwnedMediaAssetByExternalId,
  findOwnedTierPresetByExternalId,
  requireBoardOwnershipByExternalId,
  requireOwnedTemplate,
} from '../../lib/permissions'
import { loadBoundedBoardRows } from '../../workspace/sync/loadBoundedBoardRows'
import {
  marketplaceTemplatePublishResultValidator,
  marketplaceTemplateUseResultValidator,
  templateCategoryValidator,
  templateCoverFramingValidator,
  templateVisibilityValidator,
} from '../../lib/validators/marketplace'
import { tierPresetTiersValidator } from '../../lib/validators/common'
import {
  adjustPublicTemplateCount,
  allocateTemplateSlug,
  clearSourceBoardLivePublicTemplate,
  createTemplateStats,
  creditTemplateAsPublic,
  incrementTemplateForkStats,
  incrementTemplateViewStats,
  markTemplateUnpublished,
  patchTemplateAndSyncCard,
  patchTemplateTagRows,
  setSourceBoardLivePublicTemplate,
  syncTemplateTagRows,
  writeTemplateCard,
} from './lib/writes'
import { buildTemplateStateFields, isPublicTemplateRow } from './lib/state'
import {
  loadPublishedTemplateBySlug,
  loadTemplateItems,
  pickCoverItemPresentationFields,
} from './lib/projections'
import {
  insertBoardItemsFromTemplate,
  insertBoardTiers,
  templateTitleToBoardTitle,
} from './lib/board'
import {
  DEFAULT_TEMPLATE_TIERS,
  normalizeCreditLine,
  normalizeDescription,
  normalizeTags,
  normalizeTemplateTitle,
  tiersFromBoardRows,
  validateTemplateTiers,
} from './lib/normalize'
import {
  buildDefaultTemplateCriteria,
  findActiveTemplateCriterion,
} from './criteria'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
} from '../../workspace/boards/librarySummary'
import { buildFreshBoardCloudFields } from '../../workspace/boards/cloudFields'
import {
  EMPTY_BOARD_SOURCE_RANKING,
  boardSourceTemplateFromTemplate,
} from '../../workspace/boards/sourceFields'

const templateTierSelectionValidator = v.union(
  v.object({ kind: v.literal('template') }),
  v.object({ kind: v.literal('default') }),
  v.object({ kind: v.literal('preset'), presetExternalId: v.string() }),
  v.object({ kind: v.literal('custom'), tiers: tierPresetTiersValidator })
)

type TemplateTierSelection = TemplateUseTierSelection

const stringArraysEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const coverFramesEqual = (
  a: CoverFrame | null,
  b: CoverFrame | null
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

const coverFramingsEqual = (
  a: TemplateCoverFraming | null | undefined,
  b: TemplateCoverFraming | null | undefined
): boolean =>
{
  const left = a ?? null
  const right = b ?? null
  if (left === right) return true
  if (!left || !right) return false
  return COVER_SURFACES.every((surface) =>
    coverFramesEqual(left[surface], right[surface])
  )
}

const resolveCoverFraming = (
  next: TemplateCoverFraming | null | undefined,
  current: TemplateCoverFraming | null | undefined,
  coverMediaAssetId: Id<'mediaAssets'> | null
): TemplateCoverFraming | null =>
{
  if (coverMediaAssetId === null) return null
  const resolved = next === undefined ? (current ?? null) : next
  if (!resolved) return null
  for (const surface of COVER_SURFACES)
  {
    const frame = resolved[surface]
    if (frame && !isValidCoverFrame(frame))
    {
      failInput(
        'invalid coverFraming: frames must have finite, positive extents'
      )
    }
  }
  return resolved
}

const resolveCoverMediaId = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  coverMediaExternalId: string | null | undefined,
  currentMediaAssetId: Id<'mediaAssets'> | null
): Promise<Id<'mediaAssets'> | null> =>
{
  if (coverMediaExternalId === undefined)
  {
    return currentMediaAssetId
  }
  if (coverMediaExternalId === null)
  {
    return null
  }

  const asset = await findOwnedMediaAssetByExternalId(
    ctx,
    coverMediaExternalId,
    userId
  )
  if (!asset)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `cover media not found or not owned: ${coverMediaExternalId}`,
    })
  }
  return asset._id
}

type MediaBackedBoardItem = Doc<'boardItems'> & {
  mediaAssetId: Id<'mediaAssets'>
}

const isMediaBackedBoardItem = (
  item: Doc<'boardItems'>
): item is MediaBackedBoardItem => item.mediaAssetId !== null

const toTemplateCoverItem = (
  item: MediaBackedBoardItem
): Doc<'templates'>['coverItems'][number] => ({
  mediaAssetId: item.mediaAssetId,
  ...pickCoverItemPresentationFields(item),
})

const resolveTemplateTiers = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  template: Doc<'templates'>,
  selection: TemplateTierSelection | undefined
) =>
{
  const mode = selection ?? { kind: 'template' as const }
  if (mode.kind === 'template')
  {
    return template.suggestedTiers.length > 0
      ? template.suggestedTiers
      : [...DEFAULT_TEMPLATE_TIERS]
  }
  if (mode.kind === 'default')
  {
    return [...DEFAULT_TEMPLATE_TIERS]
  }
  if (mode.kind === 'custom')
  {
    validateTemplateTiers(mode.tiers)
    return mode.tiers
  }

  const preset = await findOwnedTierPresetByExternalId(
    ctx,
    mode.presetExternalId,
    userId
  )
  if (!preset)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'tier preset not found',
    })
  }
  validateTemplateTiers(preset.tiers)
  return preset.tiers
}

const findActivePublishJobForBoard = async (
  ctx: MutationCtx,
  sourceBoardId: Id<'boards'>
): Promise<Doc<'templatePublishJobs'> | null> =>
{
  const results = await Promise.all(
    ACTIVE_TEMPLATE_JOB_STATUSES.map((status) =>
      ctx.db
        .query('templatePublishJobs')
        .withIndex('bySourceBoardStatus', (q) =>
          q.eq('sourceBoardId', sourceBoardId).eq('status', status)
        )
        .take(1)
    )
  )
  return results.flat()[0] ?? null
}

const findActiveCloneJobForTemplate = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  sourceTemplateId: Id<'templates'>
): Promise<Doc<'templateCloneJobs'> | null> =>
{
  const results = await Promise.all(
    ACTIVE_TEMPLATE_JOB_STATUSES.map((status) =>
      ctx.db
        .query('templateCloneJobs')
        .withIndex('byOwnerSourceTemplateStatus', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('sourceTemplateId', sourceTemplateId)
            .eq('status', status)
        )
        .take(1)
    )
  )
  return results.flat()[0] ?? null
}

const loadBoardTiersForTemplate = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>
) =>
  await ctx.db
    .query('boardTiers')
    .withIndex('byBoard', (q) => q.eq('boardId', boardId))
    .take(51)

const loadLargePublishCoverState = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>
): Promise<{
  coverItems: Doc<'templates'>['coverItems']
}> =>
{
  const items = await ctx.db
    .query('boardItems')
    .withIndex('byBoardDeletedAtOrder', (q) =>
      q.eq('boardId', boardId).eq('deletedAt', null)
    )
    .take(MAX_STANDARD_CLOUD_BOARD_ITEMS)

  return {
    coverItems: items
      .filter(isMediaBackedBoardItem)
      .slice(0, MAX_TEMPLATE_COVER_ITEMS)
      .map(toTemplateCoverItem),
  }
}

const queueLargeTemplatePublish = async (
  ctx: MutationCtx,
  args: {
    title: string
    description: string | null
    category: TemplateCategory
    tags: string[]
    visibility: Doc<'templates'>['visibility']
    coverMediaExternalId: string | null | undefined
    coverFraming: TemplateCoverFraming | null | undefined
    creditLine: string | null
  },
  userId: Id<'users'>,
  board: Doc<'boards'>
): Promise<MarketplaceTemplatePublishResult> =>
{
  const existingJob = await findActivePublishJobForBoard(ctx, board._id)
  if (existingJob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'a publish job is already running for this board',
    })
  }

  const [serverTiers, coverState] = await Promise.all([
    loadBoardTiersForTemplate(ctx, board._id),
    loadLargePublishCoverState(ctx, board._id),
  ])
  const suggestedTiers = tiersFromBoardRows(serverTiers)
  validateTemplateTiers(suggestedTiers)
  const coverMediaAssetId = await resolveCoverMediaId(
    ctx,
    userId,
    args.coverMediaExternalId,
    null
  )
  const coverFraming = resolveCoverFraming(
    args.coverFraming,
    null,
    coverMediaAssetId
  )

  const now = Date.now()
  const slug = await allocateTemplateSlug(ctx)
  const templateState = buildTemplateStateFields(
    board.activeItemCount,
    args.visibility,
    'publishPending'
  )
  const templateFields = {
    slug,
    authorId: userId,
    title: args.title,
    description: args.description,
    category: args.category,
    tags: args.tags,
    visibility: args.visibility,
    coverMediaAssetId,
    coverFraming,
    coverItems: coverState.coverItems,
    suggestedTiers,
    criteria: buildDefaultTemplateCriteria(),
    sourceBoardId: board._id,
    ...templateState,
    itemCount: board.activeItemCount,
    featuredRank: null,
    creditLine: args.creditLine,
    itemAspectRatio: board.itemAspectRatio,
    itemAspectRatioMode: board.itemAspectRatioMode,
    defaultItemImageFit: board.defaultItemImageFit,
    defaultItemImagePadding: board.defaultItemImagePadding ?? null,
    labels: board.labels,
    autoPlate: board.autoPlate,
    createdAt: now,
    updatedAt: now,
  } satisfies Omit<Doc<'templates'>, '_id' | '_creationTime'>
  const templateId = await ctx.db.insert('templates', templateFields)
  const stats = await createTemplateStats(ctx, templateId, now)
  await writeTemplateCard(ctx, { _id: templateId, ...templateFields }, stats)
  const jobId = await ctx.db.insert('templatePublishJobs', {
    ownerId: userId,
    sourceBoardId: board._id,
    targetTemplateId: templateId,
    status: 'queued',
    itemCount: board.activeItemCount,
    processedItemCount: 0,
    nextCursor: null,
    sourceBoardRevision: board.revision,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.templates.internal.processTemplatePublishJob,
    { jobId }
  )
  return { status: 'jobQueued', slug, jobId }
}

const queueLargeTemplateClone = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  template: Doc<'templates'>,
  title: string,
  tiers: readonly TierPresetTier[],
  preferredCriterionExternalId: string | undefined
): Promise<MarketplaceTemplateUseResult> =>
{
  const existingJob = await findActiveCloneJobForTemplate(
    ctx,
    userId,
    template._id
  )
  if (existingJob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'a clone job is already running for this template',
    })
  }

  const boardExternalId = generateBoardId()
  const now = Date.now()
  const boardId = await ctx.db.insert('boards', {
    externalId: boardExternalId,
    ownerId: userId,
    title,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 0,
    sourceTemplate: boardSourceTemplateFromTemplate(template),
    sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
    // false during the clone job's queued/running phase — flipped to true the
    // moment processTemplateCloneJob ticks the fork counter at job completion
    forkCounted: false,
    preferredCriterionExternalId: preferredCriterionExternalId ?? null,
    ...buildFreshBoardCloudFields(now),
    materializationState: 'clonePending',
    itemAspectRatio: template.itemAspectRatio ?? null,
    itemAspectRatioMode: template.itemAspectRatioMode ?? null,
    aspectRatioPromptDismissed: false,
    defaultItemImageFit: template.defaultItemImageFit ?? null,
    defaultItemImagePadding: template.defaultItemImagePadding ?? null,
    paletteId: null,
    textStyleId: null,
    pageBackground: null,
    labels: template.labels ?? null,
    autoPlate: template.autoPlate,
    activeItemCount: template.itemCount,
    unrankedItemCount: template.itemCount,
    templateProgressState: resolveTemplateProgressState(template._id, {
      activeItemCount: template.itemCount,
      unrankedItemCount: template.itemCount,
    }),
    librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
    seedDatasetKey: null,
    seedReleaseId: null,
    seedExternalId: null,
    seedContentHash: null,
    seedKind: null,
    seedReleaseStatus: null,
  })
  await insertBoardTiers(ctx, boardId, tiers)

  const jobId = await ctx.db.insert('templateCloneJobs', {
    ownerId: userId,
    sourceTemplateId: template._id,
    targetBoardId: boardId,
    status: 'queued',
    itemCount: template.itemCount,
    processedItemCount: 0,
    nextCursor: null,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.templates.internal.processTemplateCloneJob,
    { jobId }
  )
  return { status: 'jobQueued', boardExternalId, jobId }
}

export const publishFromBoard = mutation({
  args: {
    boardExternalId: v.string(),
    title: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    category: templateCategoryValidator,
    tags: v.array(v.string()),
    visibility: templateVisibilityValidator,
    coverMediaExternalId: v.optional(v.union(v.string(), v.null())),
    coverFraming: v.optional(v.union(templateCoverFramingValidator, v.null())),
    creditLine: v.optional(v.union(v.string(), v.null())),
  },
  returns: marketplaceTemplatePublishResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplatePublishResult> =>
  {
    const userId = await requireCurrentUserId(ctx)
    await enforceRateLimit(ctx, 'userTemplatePublish', userId)

    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )
    if (board.deletedAt !== null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.boardDeleted,
        message: 'cannot publish a deleted board as a template',
      })
    }

    const title = normalizeTemplateTitle(args.title)
    const description = normalizeDescription(args.description)
    const creditLine = normalizeCreditLine(args.creditLine)
    const tags = normalizeTags(args.tags)
    if (board.activeItemCount === 0)
    {
      failInput('cannot publish an empty template')
    }
    await assertCanPublishTemplate(ctx, userId, board.activeItemCount)
    if (board.activeItemCount > MAX_STANDARD_CLOUD_BOARD_ITEMS)
    {
      return await queueLargeTemplatePublish(
        ctx,
        {
          title,
          description,
          category: args.category,
          tags,
          visibility: args.visibility,
          coverMediaExternalId: args.coverMediaExternalId,
          coverFraming: args.coverFraming,
          creditLine,
        },
        userId,
        board
      )
    }

    const { serverTiers, serverItems } = await loadBoundedBoardRows(
      ctx,
      board._id
    )
    const activeItems = serverItems
      .filter((item) => item.deletedAt === null)
      .sort((a, b) => a.order - b.order)

    if (activeItems.length === 0)
    {
      failInput('cannot publish an empty template')
    }
    await assertCanPublishTemplate(ctx, userId, activeItems.length)

    const coverItems = activeItems
      .filter(isMediaBackedBoardItem)
      .slice(0, MAX_TEMPLATE_COVER_ITEMS)
      .map(toTemplateCoverItem)
    const coverMediaAssetId = await resolveCoverMediaId(
      ctx,
      userId,
      args.coverMediaExternalId,
      null
    )
    const coverFraming = resolveCoverFraming(
      args.coverFraming,
      null,
      coverMediaAssetId
    )
    const suggestedTiers = tiersFromBoardRows(serverTiers)
    validateTemplateTiers(suggestedTiers)

    const now = Date.now()
    const slug = await allocateTemplateSlug(ctx)
    const templateState = buildTemplateStateFields(
      activeItems.length,
      args.visibility
    )
    const templateFields = {
      slug,
      authorId: userId,
      title,
      description,
      category: args.category,
      tags,
      visibility: args.visibility,
      coverMediaAssetId,
      coverFraming,
      coverItems,
      suggestedTiers,
      criteria: buildDefaultTemplateCriteria(),
      sourceBoardId: board._id,
      ...templateState,
      itemCount: activeItems.length,
      featuredRank: null,
      creditLine,
      itemAspectRatio: board.itemAspectRatio,
      itemAspectRatioMode: board.itemAspectRatioMode,
      defaultItemImageFit: board.defaultItemImageFit,
      defaultItemImagePadding: board.defaultItemImagePadding ?? null,
      labels: board.labels,
      autoPlate: board.autoPlate,
      createdAt: now,
      updatedAt: now,
    } satisfies Omit<Doc<'templates'>, '_id' | '_creationTime'>
    const templateId = await ctx.db.insert('templates', templateFields)
    const stats = await createTemplateStats(ctx, templateId, now)

    await Promise.all(
      activeItems.map((item, order) =>
        ctx.db.insert('templateItems', {
          templateId,
          externalId: item.externalId,
          label: item.label ?? null,
          backgroundColor: item.backgroundColor ?? null,
          mediaPlate: item.mediaPlate ?? null,
          altText: item.altText ?? null,
          mediaAssetId: item.mediaAssetId,
          order,
          aspectRatio: item.aspectRatio ?? null,
          imageFit: item.imageFit ?? null,
          transform: item.transform ?? null,
          imagePadding: item.imagePadding ?? null,
        })
      )
    )
    if (templateState.isPubliclyListable)
    {
      await creditTemplateAsPublic(
        ctx,
        { _id: templateId, category: args.category },
        board,
        now
      )
    }

    await syncTemplateTagRows(ctx, {
      _id: templateId,
      tags,
      category: args.category,
      isPubliclyListable: templateState.isPubliclyListable,
      updatedAt: now,
    })
    await writeTemplateCard(ctx, { _id: templateId, ...templateFields }, stats)

    return { status: 'published', slug }
  },
})

export const updateMyTemplateMeta = mutation({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    category: v.optional(templateCategoryValidator),
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(templateVisibilityValidator),
    coverMediaExternalId: v.optional(v.union(v.string(), v.null())),
    coverFraming: v.optional(v.union(templateCoverFramingValidator, v.null())),
    creditLine: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await requireOwnedTemplate(ctx, args.slug, userId)
    const title =
      args.title === undefined
        ? template.title
        : normalizeTemplateTitle(args.title)
    const description =
      args.description === undefined
        ? template.description
        : normalizeDescription(args.description)
    const category = args.category ?? template.category
    const tags =
      args.tags === undefined ? template.tags : normalizeTags(args.tags)
    const creditLine =
      args.creditLine === undefined
        ? template.creditLine
        : normalizeCreditLine(args.creditLine)
    const previousPublic = isPublicTemplateRow(template)
    const nextVisibility = args.visibility ?? template.visibility
    const nextTemplateState = buildTemplateStateFields(
      template.itemCount,
      nextVisibility,
      template.publicationState
    )
    const coverMediaAssetId = await resolveCoverMediaId(
      ctx,
      userId,
      args.coverMediaExternalId,
      template.coverMediaAssetId
    )
    const nextCoverFraming = resolveCoverFraming(
      args.coverFraming,
      template.coverFraming,
      coverMediaAssetId
    )

    const tagsChanged = !stringArraysEqual(template.tags, tags)
    const framingChanged = !coverFramingsEqual(
      template.coverFraming,
      nextCoverFraming
    )
    const nextPublic = nextTemplateState.isPubliclyListable
    const templateChanged =
      title !== template.title ||
      description !== template.description ||
      category !== template.category ||
      tagsChanged ||
      nextVisibility !== template.visibility ||
      nextTemplateState.sizeClass !== template.sizeClass ||
      nextTemplateState.publicationState !== template.publicationState ||
      nextPublic !== previousPublic ||
      coverMediaAssetId !== template.coverMediaAssetId ||
      framingChanged ||
      creditLine !== template.creditLine
    if (!templateChanged) return null

    const now = Date.now()
    const templatePatch = {
      title,
      description,
      category,
      tags,
      visibility: nextVisibility,
      ...nextTemplateState,
      coverMediaAssetId,
      coverFraming: nextCoverFraming,
      creditLine,
      updatedAt: now,
    }
    const nextTemplate = await patchTemplateAndSyncCard(
      ctx,
      template,
      templatePatch
    )
    const stayedPublicSameCategory =
      previousPublic && nextPublic && template.category === category
    if (!stayedPublicSameCategory)
    {
      const transitions: { category: TemplateCategory; delta: number }[] = []
      if (previousPublic)
      {
        transitions.push({ category: template.category, delta: -1 })
      }
      if (nextPublic)
      {
        transitions.push({ category, delta: 1 })
      }
      await adjustPublicTemplateCount(ctx, transitions)
    }
    if (previousPublic && !nextPublic)
    {
      await clearSourceBoardLivePublicTemplate(ctx, template)
    }
    if (!previousPublic && nextPublic)
    {
      const sourceBoard =
        template.sourceBoardId === null
          ? null
          : await ctx.db.get(template.sourceBoardId)
      await setSourceBoardLivePublicTemplate(
        ctx,
        sourceBoard,
        template._id,
        now
      )
    }

    if (tagsChanged || template.category !== category)
    {
      await syncTemplateTagRows(ctx, nextTemplate)
    }
    else if (previousPublic !== nextPublic)
    {
      await patchTemplateTagRows(ctx, template._id, {
        isPubliclyListable: nextPublic,
        updatedAt: now,
      })
    }

    return null
  },
})

export const unpublishMyTemplate = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return null
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await requireOwnedTemplate(ctx, args.slug, userId)
    if (template.publicationState === 'unpublished')
    {
      return null
    }

    const now = Date.now()
    await markTemplateUnpublished(ctx, template, now)

    return null
  },
})

// reverse of unpublishMyTemplate — clears the tombstone & restores the
// template to its stored visibility. counter & tag rows are re-credited only
// when the resulting state is publicly visible
export const republishMyTemplate = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return null
    }

    const userId = await requireCurrentUserId(ctx)
    const template = await requireOwnedTemplate(ctx, args.slug, userId)
    if (template.publicationState !== 'unpublished')
    {
      return null
    }

    const now = Date.now()
    const nextTemplateState = buildTemplateStateFields(
      template.itemCount,
      template.visibility,
      'published'
    )
    await patchTemplateAndSyncCard(ctx, template, {
      ...nextTemplateState,
      updatedAt: now,
    })
    if (nextTemplateState.isPubliclyListable)
    {
      const sourceBoard =
        template.sourceBoardId === null
          ? null
          : await ctx.db.get(template.sourceBoardId)
      await creditTemplateAsPublic(ctx, template, sourceBoard, now)
    }
    await patchTemplateTagRows(ctx, template._id, {
      isPubliclyListable: nextTemplateState.isPubliclyListable,
      updatedAt: now,
    })

    return null
  },
})

export const recordTemplateView = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return null
    }

    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }
    // scoped per (user, slug) so refresh-spam on one template depletes only
    // its own bucket — browsing many templates never throttles itself.
    // bucket size in convex/lib/rateLimiter.ts is intentionally tight
    await enforceRateLimit(ctx, 'userTemplateView', userId, {
      scope: args.slug,
    })

    const template = await loadPublishedTemplateBySlug(ctx, args.slug)
    if (!template) return null

    await incrementTemplateViewStats(ctx, template, Date.now())
    return null
  },
})

export const useTemplate = mutation({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
    tierSelection: v.optional(templateTierSelectionValidator),
    preferredCriterionExternalId: v.optional(v.string()),
  },
  returns: marketplaceTemplateUseResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateUseResult> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }

    const userId = await requireCurrentUserId(ctx)
    // throttle before the board insert so a script can't mass-create boards or
    // inflate the template's forkCount/trendingScore
    await enforceRateLimit(ctx, 'userTemplateFork', userId)
    const template = await loadPublishedTemplateBySlug(ctx, args.slug)
    if (!template)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }
    await assertCanUseTemplate(ctx, userId, template)

    const tiers = await resolveTemplateTiers(
      ctx,
      userId,
      template,
      args.tierSelection
    )
    const boardTitle = normalizeBoardTitle(
      args.title ?? templateTitleToBoardTitle(template.title)
    )
    const preferredCriterionExternalId = findActiveTemplateCriterion(
      template,
      args.preferredCriterionExternalId
    )?.externalId
    if (template.itemCount > MAX_STANDARD_CLOUD_BOARD_ITEMS)
    {
      return await queueLargeTemplateClone(
        ctx,
        userId,
        template,
        boardTitle,
        tiers,
        preferredCriterionExternalId
      )
    }

    const templateItems = await loadTemplateItems(ctx, template._id)
    if (templateItems.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'template has no items',
      })
    }
    await assertCanUseTemplate(ctx, userId, {
      itemCount: templateItems.length,
    })

    const boardExternalId = generateBoardId()
    const now = Date.now()
    const progressCounts = {
      activeItemCount: templateItems.length,
      unrankedItemCount: templateItems.length,
    }
    const boardId = await ctx.db.insert('boards', {
      externalId: boardExternalId,
      ownerId: userId,
      title: boardTitle,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 0,
      sourceTemplate: boardSourceTemplateFromTemplate(template),
      sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
      // counter ticks inline below via incrementTemplateForkStats so this is
      // already "counted" the moment the board exists server-side
      forkCounted: true,
      preferredCriterionExternalId: preferredCriterionExternalId ?? null,
      ...buildFreshBoardCloudFields(now),
      // propagate the template's design-time ratio so per-item transforms
      // (computed in seed against this same ratio) frame correctly. unset
      // values fall back to board defaults (1, auto, cover)
      itemAspectRatio: template.itemAspectRatio ?? null,
      itemAspectRatioMode: template.itemAspectRatioMode ?? null,
      aspectRatioPromptDismissed: false,
      defaultItemImageFit: template.defaultItemImageFit ?? null,
      defaultItemImagePadding: template.defaultItemImagePadding ?? null,
      paletteId: null,
      textStyleId: null,
      pageBackground: null,
      labels: template.labels ?? null,
      autoPlate: template.autoPlate,
      ...progressCounts,
      templateProgressState: resolveTemplateProgressState(
        template._id,
        progressCounts
      ),
      librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
      seedDatasetKey: null,
      seedReleaseId: null,
      seedExternalId: null,
      seedContentHash: null,
      seedKind: null,
      seedReleaseStatus: null,
    })

    await insertBoardTiers(ctx, boardId, tiers)
    const summaryItems = await insertBoardItemsFromTemplate(
      ctx,
      boardId,
      templateItems
    )
    await ctx.db.patch(boardId, {
      librarySummary: buildBoardLibrarySummary({
        tiers: tiers.map((tier, order) => ({
          key: String(order),
          order,
          colorSpec: tier.colorSpec,
        })),
        items: summaryItems,
      }),
    })
    await incrementTemplateForkStats(ctx, template, now)

    return { status: 'ready', boardExternalId }
  },
})

export const retryTemplatePublishJob = mutation({
  args: { jobId: v.id('templatePublishJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job || job.ownerId !== userId || job.status !== 'failed')
    {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(job._id, {
      status: 'queued',
      errorCode: null,
      retryCount: job.retryCount + 1,
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.marketplace.templates.internal.processTemplatePublishJob,
      { jobId: job._id }
    )
    return null
  },
})

export const cancelTemplatePublishJob = mutation({
  args: { jobId: v.id('templatePublishJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (
      !job ||
      job.ownerId !== userId ||
      isFinishedTemplateJobStatus(job.status)
    )
    {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(job._id, {
      status: 'canceled',
      errorCode: null,
      canceledAt: now,
      completedAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.marketplace.templates.internal.cascadeDeleteTemplate,
      { templateId: job.targetTemplateId, cursor: null, phase: 'items' }
    )
    return null
  },
})

export const retryTemplateCloneJob = mutation({
  args: { jobId: v.id('templateCloneJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (!job || job.ownerId !== userId || job.status !== 'failed')
    {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(job._id, {
      status: 'queued',
      errorCode: null,
      retryCount: job.retryCount + 1,
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      updatedAt: now,
    })
    const board = await ctx.db.get(job.targetBoardId)
    if (board)
    {
      await ctx.db.patch(board._id, {
        materializationState: 'clonePending',
        updatedAt: now,
      })
    }
    await ctx.scheduler.runAfter(
      0,
      internal.marketplace.templates.internal.processTemplateCloneJob,
      { jobId: job._id }
    )
    return null
  },
})

export const cancelTemplateCloneJob = mutation({
  args: { jobId: v.id('templateCloneJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    if (
      !job ||
      job.ownerId !== userId ||
      isFinishedTemplateJobStatus(job.status)
    )
    {
      return null
    }

    const now = Date.now()
    await ctx.db.patch(job._id, {
      status: 'canceled',
      errorCode: null,
      canceledAt: now,
      completedAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.workspace.boards.internal.cascadeDeleteBoard,
      { boardId: job.targetBoardId, cursor: null, phase: 'items' }
    )
    return null
  },
})
