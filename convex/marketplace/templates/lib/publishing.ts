// convex/marketplace/templates/lib/publishing.ts
// shared template publish insert & cover helpers

import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import {
  COVER_SURFACES,
  isValidCoverFrame,
  type CoverFrame,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'
import { failInput } from '../../../lib/text'
import { findOwnedMediaAssetByExternalId } from '../../../lib/permissions'
import { buildDefaultTemplateCriteria } from '../criteria'
import { buildTemplateStateFields } from './state'
import { pickCoverItemPresentationFields } from './projections'

type TemplateInsertFields = Omit<Doc<'templates'>, '_id' | '_creationTime'>

export const buildTemplateInsertFields = (args: {
  slug: string
  authorId: Id<'users'>
  title: string
  description: TemplateInsertFields['description']
  category: TemplateCategory
  tags: string[]
  visibility: TemplateInsertFields['visibility']
  coverMediaAssetId: TemplateInsertFields['coverMediaAssetId']
  coverFraming: TemplateInsertFields['coverFraming']
  coverItems: TemplateInsertFields['coverItems']
  suggestedTiers: TemplateInsertFields['suggestedTiers']
  templateState: ReturnType<typeof buildTemplateStateFields>
  sourceBoardId: Id<'boards'>
  itemCount: number
  creditLine: string | null
  board: Pick<
    Doc<'boards'>,
    | 'itemAspectRatio'
    | 'itemAspectRatioMode'
    | 'defaultItemImageFit'
    | 'defaultItemImagePadding'
    | 'labels'
    | 'autoPlate'
  >
  now: number
}): TemplateInsertFields => ({
  slug: args.slug,
  authorId: args.authorId,
  title: args.title,
  description: args.description,
  category: args.category,
  tags: args.tags,
  visibility: args.visibility,
  coverMediaAssetId: args.coverMediaAssetId,
  coverFraming: args.coverFraming,
  coverItems: args.coverItems,
  suggestedTiers: args.suggestedTiers,
  criteria: buildDefaultTemplateCriteria(),
  sourceBoardId: args.sourceBoardId,
  ...args.templateState,
  itemCount: args.itemCount,
  featuredRank: null,
  creditLine: args.creditLine,
  itemAspectRatio: args.board.itemAspectRatio,
  itemAspectRatioMode: args.board.itemAspectRatioMode,
  defaultItemImageFit: args.board.defaultItemImageFit,
  defaultItemImagePadding: args.board.defaultItemImagePadding ?? null,
  labels: args.board.labels,
  autoPlate: args.board.autoPlate,
  createdAt: args.now,
  updatedAt: args.now,
})

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

export const coverFramingsEqual = (
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

export const resolveCoverFraming = (
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

export const resolveCoverMediaId = async (
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

export const isMediaBackedBoardItem = (
  item: Doc<'boardItems'>
): item is MediaBackedBoardItem => item.mediaAssetId !== null

export const toTemplateCoverItem = (
  item: MediaBackedBoardItem
): Doc<'templates'>['coverItems'][number] => ({
  mediaAssetId: item.mediaAssetId,
  ...pickCoverItemPresentationFields(item),
})
