import type { Doc, Id } from '../../_generated/dataModel'

export type BoardSourceTemplate = Doc<'boards'>['sourceTemplate']
export type BoardSourceRanking = Doc<'boards'>['sourceRanking']

export const EMPTY_BOARD_SOURCE_TEMPLATE: BoardSourceTemplate = Object.freeze({
  id: null,
  category: null,
  sizeClass: null,
  title: null,
}) as BoardSourceTemplate

export const EMPTY_BOARD_SOURCE_RANKING: BoardSourceRanking = Object.freeze({
  id: null,
  title: null,
}) as BoardSourceRanking

export const boardSourceTemplateFromTemplate = (
  template: Pick<Doc<'templates'>, '_id' | 'category' | 'sizeClass' | 'title'>
): BoardSourceTemplate => ({
  id: template._id,
  category: template.category,
  sizeClass: template.sizeClass,
  title: template.title,
})

export const boardSourceRankingFromRanking = (
  ranking: Pick<Doc<'publishedRankings'>, '_id' | 'title'>
): BoardSourceRanking => ({
  id: ranking._id,
  title: ranking.title,
})

export const boardSourceTemplateFromMaybeTemplate = (
  template:
    | Pick<Doc<'templates'>, '_id' | 'category' | 'sizeClass' | 'title'>
    | null
    | undefined,
  fallbackTitle?: string
): BoardSourceTemplate =>
{
  if (template) return boardSourceTemplateFromTemplate(template)
  if (fallbackTitle)
    return { ...EMPTY_BOARD_SOURCE_TEMPLATE, title: fallbackTitle }
  return EMPTY_BOARD_SOURCE_TEMPLATE
}

export const boardSourceRankingFromMaybeRanking = (
  ranking: Pick<Doc<'publishedRankings'>, '_id' | 'title'> | null | undefined,
  fallbackTitle?: string
): BoardSourceRanking =>
{
  if (ranking) return boardSourceRankingFromRanking(ranking)
  if (fallbackTitle)
    return { ...EMPTY_BOARD_SOURCE_RANKING, title: fallbackTitle }
  return EMPTY_BOARD_SOURCE_RANKING
}

export const getBoardSourceTemplateId = (
  board: Pick<Doc<'boards'>, 'sourceTemplate'>
): Id<'templates'> | null => board.sourceTemplate.id

export const getBoardSourceRankingId = (
  board: Pick<Doc<'boards'>, 'sourceRanking'>
): Id<'publishedRankings'> | null => board.sourceRanking.id
