// convex/marketplace/templates/lib/writes.ts
// template table writes & lifecycle: stats/cards/tags writes, publication-state
// mutations, parent deletes, & slug allocation

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import type { TemplatePublicationState } from '@tierlistbuilder/contracts/marketplace/template'
import {
  generateTemplateSlug,
  MAX_TEMPLATE_TAGS,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  getInitialTemplateCardMetrics,
  getTemplateCardMetrics,
  getTemplateMetricDayStart,
  readTemplateCounters,
  MARKETPLACE_STATS_KEY,
  type TemplateCounterSource,
  type TemplateStatsCounters,
} from './trending'
import { failState } from './normalize'
import { isPublicTemplateRow } from './state'
import {
  buildTemplateCardFields,
  findTemplateCardByTemplateId,
  findTemplateStatsByTemplateId,
  requireTemplateCardByTemplateId,
  requireTemplateStats,
  type TemplateCardSource,
} from './projections'
import { validateTemplateCriteria } from '../criteria'

type DbCtx = QueryCtx | MutationCtx

const MAX_SLUG_ATTEMPTS = 8
type TemplatePatch = Partial<Omit<Doc<'templates'>, '_id' | '_creationTime'>>

const normalizeTemplatePatchForWrite = (
  patch: TemplatePatch
): TemplatePatch =>
{
  if (patch.criteria === undefined) return patch
  return { ...patch, criteria: validateTemplateCriteria(patch.criteria) }
}

export const allocateTemplateSlug = async (ctx: DbCtx): Promise<string> =>
{
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++)
  {
    const slug = generateTemplateSlug()
    const existing = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', slug))
      .unique()

    if (!existing)
    {
      return slug
    }
  }

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.slugAllocationFailed,
    message: 'failed to allocate a unique template slug',
  })
}

export const clearSourceBoardLivePublicTemplate = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  if (template.sourceBoardId === null) return
  const board = await ctx.db.get(template.sourceBoardId)
  if (!board || board.livePublicTemplateId !== template._id) return

  await ctx.db.patch(board._id, {
    livePublicTemplateId: null,
  })
}

export const markTemplateNotPublic = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number,
  publicationState: Exclude<TemplatePublicationState, 'published'>,
  options: { clearSourceBoard?: boolean } = {}
): Promise<Doc<'templates'>> =>
{
  const wasPublic = isPublicTemplateRow(template)
  if (template.publicationState === publicationState && !wasPublic)
  {
    return template
  }

  const nextTemplate = await patchTemplateAndSyncCard(ctx, template, {
    publicationState,
    isPubliclyListable: false,
    updatedAt: now,
  })
  await patchTemplateTagRows(ctx, template._id, {
    isPubliclyListable: false,
    updatedAt: now,
  })
  if (wasPublic)
  {
    await adjustPublicTemplateCount(ctx, [
      { category: template.category, delta: -1 },
    ])
  }
  if (options.clearSourceBoard ?? true)
  {
    await clearSourceBoardLivePublicTemplate(ctx, template)
  }
  return nextTemplate
}

export const markTemplateUnpublished = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number,
  options: { clearSourceBoard?: boolean } = {}
): Promise<void> =>
{
  await markTemplateNotPublic(ctx, template, now, 'unpublished', options)
}

export const setSourceBoardLivePublicTemplate = async (
  ctx: MutationCtx,
  sourceBoard: Doc<'boards'> | null,
  templateId: Id<'templates'>,
  now: number
): Promise<void> =>
{
  if (!sourceBoard) return
  if (sourceBoard.livePublicTemplateId === templateId) return

  if (
    sourceBoard.livePublicTemplateId !== null &&
    sourceBoard.livePublicTemplateId !== templateId
  )
  {
    const previous = await ctx.db.get(sourceBoard.livePublicTemplateId)
    if (previous)
    {
      await markTemplateUnpublished(ctx, previous, now, {
        clearSourceBoard: false,
      })
    }
  }

  await ctx.db.patch(sourceBoard._id, {
    livePublicTemplateId: templateId,
  })
}

export interface PublicCategoryDelta
{
  category: TemplateCategory
  delta: number
}

// batch-update both the total & per-category breakdown in a single read+write.
// pass one delta per category-transition so a category change publishes as
// `[{category: prev, delta: -1}, {category: next, delta: +1}]`
export const adjustPublicTemplateCount = async (
  ctx: MutationCtx,
  changes: readonly PublicCategoryDelta[]
): Promise<void> =>
{
  if (changes.length === 0)
  {
    return
  }
  const totalDelta = changes.reduce((sum, change) => sum + change.delta, 0)
  if (totalDelta === 0 && changes.every((change) => change.delta === 0))
  {
    return
  }

  const stats = await ctx.db
    .query('marketplaceStats')
    .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
    .unique()
  const nextCount = Math.max(0, (stats?.publicTemplateCount ?? 0) + totalDelta)

  const nextByCategory: Record<string, number> = {
    ...(stats?.publicTemplateCountByCategory ?? {}),
  }
  for (const { category, delta } of changes)
  {
    const updated = Math.max(0, (nextByCategory[category] ?? 0) + delta)
    if (updated === 0)
    {
      delete nextByCategory[category]
    }
    else
    {
      nextByCategory[category] = updated
    }
  }

  const now = Date.now()
  if (stats)
  {
    await ctx.db.patch(stats._id, {
      publicTemplateCount: nextCount,
      publicTemplateCountByCategory: nextByCategory,
      updatedAt: now,
    })
    return
  }

  await ctx.db.insert('marketplaceStats', {
    key: MARKETPLACE_STATS_KEY,
    publicTemplateCount: nextCount,
    publicTemplateCountByCategory: nextByCategory,
    updatedAt: now,
  })
}

export const createTemplateStats = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  now: number
): Promise<TemplateStatsCounters> =>
{
  const stats = {
    forkCount: 0,
    viewCount: 0,
  }
  await ctx.db.insert('templateStats', {
    templateId,
    ...stats,
    updatedAt: now,
  })
  return stats
}

const deleteTemplateStatsIfExists = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const stats = await findTemplateStatsByTemplateId(ctx, templateId)
  if (stats)
  {
    await ctx.db.delete(stats._id)
  }
}

export const deleteTemplateStats = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const stats = await requireTemplateStats(ctx, templateId)
  await ctx.db.delete(stats._id)
}

const incrementTemplateMetricDay = async (
  ctx: MutationCtx,
  template: Pick<Doc<'templates'>, '_id' | 'category'>,
  now: number,
  metric: keyof TemplateStatsCounters
): Promise<void> =>
{
  const dayStartAt = getTemplateMetricDayStart(now)
  const existing = await ctx.db
    .query('templateMetricDays')
    .withIndex('byTemplateDay', (q) =>
      q.eq('templateId', template._id).eq('dayStartAt', dayStartAt)
    )
    .unique()

  if (existing)
  {
    const current = readTemplateCounters(existing)
    await ctx.db.patch(existing._id, {
      category: template.category,
      forkCount:
        metric === 'forkCount' ? current.forkCount + 1 : current.forkCount,
      viewCount:
        metric === 'viewCount' ? current.viewCount + 1 : current.viewCount,
      updatedAt: now,
    })
    return
  }

  await ctx.db.insert('templateMetricDays', {
    templateId: template._id,
    category: template.category,
    dayStartAt,
    forkCount: metric === 'forkCount' ? 1 : 0,
    viewCount: metric === 'viewCount' ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })
}

const incrementTemplateMetric = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number,
  metric: keyof TemplateStatsCounters
): Promise<TemplateStatsCounters> =>
{
  const [stats, card] = await Promise.all([
    requireTemplateStats(ctx, template._id),
    requireTemplateCardByTemplateId(ctx, template._id),
  ])
  const current = readTemplateCounters(stats)
  const next: TemplateStatsCounters = {
    ...current,
    [metric]: current[metric] + 1,
  }
  await Promise.all([
    ctx.db.patch(stats._id, {
      ...next,
      updatedAt: now,
    }),
    ctx.db.patch(card._id, {
      forkCount: next.forkCount,
      viewCount: next.viewCount,
    }),
    incrementTemplateMetricDay(ctx, template, now, metric),
  ])
  return next
}

export const incrementTemplateForkStats = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  now: number
): Promise<TemplateStatsCounters> =>
{
  const template = await ctx.db.get(templateId)
  if (!template) return failState(`template missing: ${templateId}`)
  return await incrementTemplateMetric(ctx, template, now, 'forkCount')
}

export const incrementTemplateViewStats = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number
): Promise<TemplateStatsCounters> =>
  await incrementTemplateMetric(ctx, template, now, 'viewCount')

export const deleteTemplateParentRow = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  await Promise.all([
    clearSourceBoardLivePublicTemplate(ctx, template),
    deleteTemplateCard(ctx, template._id),
    deleteTemplateStats(ctx, template._id),
  ])
  await ctx.db.delete(template._id)
}

export const deleteTemplateParentForCascade = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  if (isPublicTemplateRow(template))
  {
    await adjustPublicTemplateCount(ctx, [
      { category: template.category, delta: -1 },
    ])
  }
  await deleteTemplateParentRow(ctx, template)
}

export const writeTemplateCard = async (
  ctx: MutationCtx,
  template: TemplateCardSource,
  stats: TemplateCounterSource
): Promise<void> =>
{
  const fields = await buildTemplateCardFields(
    ctx,
    template,
    getInitialTemplateCardMetrics(readTemplateCounters(stats))
  )
  const existing = await findTemplateCardByTemplateId(ctx, template._id)
  if (existing)
  {
    await ctx.db.patch(existing._id, fields)
    return
  }
  await ctx.db.insert('templateCards', fields)
}

// upsert a card while preserving its counters; counters live on templateCards
// for the gallery sort indexes so a parent-only patch (title/category/tags)
// must not zero them. falls back to templateStats only on first insert
export const writeTemplateCardPreservingCounters = async (
  ctx: MutationCtx,
  template: TemplateCardSource
): Promise<void> =>
{
  const card = await findTemplateCardByTemplateId(ctx, template._id)
  const metrics = card
    ? getTemplateCardMetrics(card)
    : getInitialTemplateCardMetrics(
        readTemplateCounters(await requireTemplateStats(ctx, template._id))
      )
  const fields = await buildTemplateCardFields(ctx, template, metrics)
  if (card)
  {
    await ctx.db.patch(card._id, fields)
    return
  }
  await ctx.db.insert('templateCards', fields)
}

export const patchTemplateAndSyncCard = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  patch: TemplatePatch
): Promise<Doc<'templates'>> =>
{
  const normalizedPatch = normalizeTemplatePatchForWrite(patch)
  await ctx.db.patch(template._id, normalizedPatch)
  const nextTemplate = { ...template, ...normalizedPatch }
  await writeTemplateCardPreservingCounters(ctx, nextTemplate)
  return nextTemplate
}

export const patchTemplateAndSyncCardById = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  patch: TemplatePatch
): Promise<Doc<'templates'> | null> =>
{
  const template = await ctx.db.get(templateId)
  if (!template)
  {
    await Promise.all([
      deleteTemplateCardIfExists(ctx, templateId),
      deleteTemplateStatsIfExists(ctx, templateId),
    ])
    return null
  }
  return await patchTemplateAndSyncCard(ctx, template, patch)
}

const deleteTemplateCardIfExists = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const existing = await findTemplateCardByTemplateId(ctx, templateId)
  if (existing)
  {
    await ctx.db.delete(existing._id)
  }
}

export const deleteTemplateCard = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const existing = await requireTemplateCardByTemplateId(ctx, templateId)
  await ctx.db.delete(existing._id)
}

// hard cap on tag-row reads; tags are bounded by MAX_TEMPLATE_TAGS at publish
// time so this only protects against drift if that cap is later relaxed
const TAG_ROW_READ_CAP = MAX_TEMPLATE_TAGS * 2

// rebuild the templateTags rows for a single template. used after publish &
// after any meta update — replace strategy is fine here because tag rows are
// bounded (<= 12 per template) & per-template metadata writes are infrequent
export const syncTemplateTagRows = async (
  ctx: MutationCtx,
  template: Pick<
    Doc<'templates'>,
    '_id' | 'tags' | 'category' | 'isPubliclyListable' | 'updatedAt'
  >
): Promise<{ deleted: number; inserted: number }> =>
{
  const existing = await ctx.db
    .query('templateTags')
    .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
    .take(TAG_ROW_READ_CAP)
  await Promise.all(existing.map((row) => ctx.db.delete(row._id)))
  await Promise.all(
    template.tags.map((tag) =>
      ctx.db.insert('templateTags', {
        templateId: template._id,
        tag,
        category: template.category,
        isPubliclyListable: template.isPubliclyListable,
        updatedAt: template.updatedAt,
      })
    )
  )
  return { deleted: existing.length, inserted: template.tags.length }
}

// patch denormalized fields on every tag row of a template w/o touching the
// tag list itself. used by unpublish & visibility-only flips so we don't churn
// rows when the membership set is unchanged
export const patchTemplateTagRows = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  fields: {
    isPubliclyListable?: boolean
    updatedAt?: number
    category?: TemplateCategory
  }
): Promise<void> =>
{
  const rows = await ctx.db
    .query('templateTags')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(TAG_ROW_READ_CAP)
  await Promise.all(rows.map((row) => ctx.db.patch(row._id, fields)))
}
