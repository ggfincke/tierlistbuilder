// convex/marketplace/rankings/public/aggregateQueries.ts
// aggregate-item search, sort, band filtering, & pagination helpers

import { type PaginationOptions } from 'convex/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { type QueryCtx } from '../../../_generated/server'
import type {
  MarketplaceTemplateRankingAggregateItemsResult,
  TemplateRankingAggregateItemBand,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  MAX_AGGREGATE_SEARCH_LENGTH,
  MAX_SYNC_ITEMS,
} from '../../../lib/limits'
import { emptyPaginatedResult } from '../../../lib/pagination'
import { normalizeTemplateRankingAggregateItemPageSize } from '../aggregate/lib'

const SEARCH_CURSOR_PREFIX = 'offset:'

export const emptyAggregateItemsResult = (
  cursor: string | null
): MarketplaceTemplateRankingAggregateItemsResult =>
  emptyPaginatedResult<
    MarketplaceTemplateRankingAggregateItemsResult['page'][number]
  >(cursor)

export const normalizeAggregateSearch = (
  raw: string | null | undefined
): string | null =>
{
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, MAX_AGGREGATE_SEARCH_LENGTH)
  return trimmed.length > 0 ? trimmed : null
}

const parseSearchCursorOffset = (cursor: string | null): number =>
{
  if (!cursor?.startsWith(SEARCH_CURSOR_PREFIX)) return 0
  const parsed = Number(cursor.slice(SEARCH_CURSOR_PREFIX.length))
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

const searchCursorForOffset = (offset: number): string =>
  `${SEARCH_CURSOR_PREFIX}${offset}`

type AggregateItemRow = Doc<'templateRankingAggregateItems'>

const aggregateSortValue = (
  row: AggregateItemRow,
  sort: TemplateRankingAggregateItemSort
): number =>
{
  if (sort === 'averageTop') return row.averageTopSort
  if (sort === 'averageBottom') return row.averageBottomSort
  if (sort === 'consensus' || sort === 'consensusTop') return row.consensusSort
  if (sort === 'controversy') return row.controversySort
  return row.order
}

const sortAggregateRows = (
  rows: AggregateItemRow[],
  sort: TemplateRankingAggregateItemSort
): AggregateItemRow[] =>
  rows
    .slice()
    .sort(
      (a, b) =>
        aggregateSortValue(a, sort) - aggregateSortValue(b, sort) ||
        a.order - b.order
    )

const paginateSortedAggregateRows = (
  rows: AggregateItemRow[],
  sort: TemplateRankingAggregateItemSort,
  cursor: string | null,
  pageSize: number
) =>
{
  const sorted = sortAggregateRows(rows, sort)
  const offset = parseSearchCursorOffset(cursor)
  const nextOffset = offset + pageSize
  const page = sorted.slice(offset, nextOffset)
  const isDone = nextOffset >= sorted.length
  return {
    page,
    isDone,
    continueCursor: isDone ? '' : searchCursorForOffset(nextOffset),
  }
}

interface AggregateItemsPageOptions
{
  templateId: Id<'templates'>
  criterionExternalId: string
  generation: number
  sort: TemplateRankingAggregateItemSort
  band: TemplateRankingAggregateItemBand
  search: string | null
  paginationOpts: PaginationOptions
}

const takeSearchAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions,
  pageSize: number
) =>
{
  const search = options.search
  if (!search) return null

  const rows = await ctx.db
    .query('templateRankingAggregateItems')
    .withSearchIndex('searchByTemplateCriterionGeneration', (q) =>
    {
      const base = q
        .search('searchText', search)
        .eq('templateId', options.templateId)
        .eq('criterionExternalId', options.criterionExternalId)
        .eq('generation', options.generation)
      if (options.band === 'top')
      {
        return base.eq('isTopBucket', true)
      }
      if (options.band === 'bottom')
      {
        return base.eq('isBottomBucket', true)
      }
      if (options.band === 'controversial')
      {
        return base.eq('isControversial', true)
      }
      if (options.sort === 'consensusTop')
      {
        return base.eq('isTopBucket', true)
      }
      return base
    })
    .take(MAX_SYNC_ITEMS)
  return paginateSortedAggregateRows(
    rows,
    options.sort,
    options.paginationOpts.cursor,
    pageSize
  )
}

const aggregateItemsOrderIndexByBand = {
  all: 'byTemplateIdAndCriterionAndGenerationAndOrder',
  top: 'byTemplateCriterionGenerationTopOrder',
  bottom: 'byTemplateCriterionGenerationBottomOrder',
  controversial: 'byTemplateCriterionGenerationControversialOrder',
} as const satisfies Record<TemplateRankingAggregateItemBand, string>

// band='all' has a per-sort index; band-filtered shares one per-band index &
// JS-sorts in memory. consensusTop is rewritten to band='top' upstream
type AllBandIndexedSort = Exclude<
  TemplateRankingAggregateItemSort,
  'consensusTop'
>

const allBandSortIndexBySort = {
  averageTop: 'byTemplateIdAndCriterionAndGenerationAndAvgTopSortAndOrder',
  averageBottom:
    'byTemplateIdAndCriterionAndGenerationAndAvgBottomSortAndOrder',
  consensus: 'byTemplateIdAndCriterionAndGenerationAndConsensusSortAndOrder',
  controversy:
    'byTemplateIdAndCriterionAndGenerationAndControversySortAndOrder',
  templateOrder: 'byTemplateIdAndCriterionAndGenerationAndOrder',
} as const satisfies Record<AllBandIndexedSort, string>

const resolveAggregateItemsIndexBand = (
  band: TemplateRankingAggregateItemBand,
  sort: TemplateRankingAggregateItemSort
): TemplateRankingAggregateItemBand =>
  band === 'all' && sort === 'consensusTop' ? 'top' : band

const takeAllBandPaginatedPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions,
  pageSize: number,
  indexName: (typeof allBandSortIndexBySort)[keyof typeof allBandSortIndexBySort]
) =>
  await ctx.db
    .query('templateRankingAggregateItems')
    .withIndex(indexName, (q) =>
      q
        .eq('templateId', options.templateId)
        .eq('criterionExternalId', options.criterionExternalId)
        .eq('generation', options.generation)
    )
    .paginate({ ...options.paginationOpts, numItems: pageSize })

const takeBandFilteredAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions,
  pageSize: number,
  indexBand: Exclude<TemplateRankingAggregateItemBand, 'all'>
) =>
{
  const indexName = aggregateItemsOrderIndexByBand[indexBand]
  const rows = await ctx.db
    .query('templateRankingAggregateItems')
    .withIndex(indexName, (q) =>
    {
      const base = q
        .eq('templateId', options.templateId)
        .eq('criterionExternalId', options.criterionExternalId)
        .eq('generation', options.generation)
      if (indexBand === 'top') return base.eq('isTopBucket', true)
      if (indexBand === 'bottom') return base.eq('isBottomBucket', true)
      return base.eq('isControversial', true)
    })
    .take(MAX_SYNC_ITEMS)
  return paginateSortedAggregateRows(
    rows,
    options.sort,
    options.paginationOpts.cursor,
    pageSize
  )
}

const takeIndexedAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions,
  pageSize: number
) =>
{
  const indexBand = resolveAggregateItemsIndexBand(options.band, options.sort)
  if (indexBand === 'all' && options.sort !== 'consensusTop')
  {
    return await takeAllBandPaginatedPage(
      ctx,
      options,
      pageSize,
      allBandSortIndexBySort[options.sort]
    )
  }
  return await takeBandFilteredAggregateItemsPage(
    ctx,
    options,
    pageSize,
    indexBand === 'all' ? 'top' : indexBand
  )
}

export const takeAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions
) =>
{
  const pageSize = normalizeTemplateRankingAggregateItemPageSize(
    options.paginationOpts.numItems
  )
  const searchPage = await takeSearchAggregateItemsPage(ctx, options, pageSize)
  if (searchPage) return searchPage
  return await takeIndexedAggregateItemsPage(ctx, options, pageSize)
}
