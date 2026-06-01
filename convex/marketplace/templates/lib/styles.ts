// convex/marketplace/templates/lib/styles.ts
// image-style resolution: single source of style precedence for fork, live-switch, & publish.
// default style reads templateItems; non-default styles read templateItemStyleAssets

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type {
  ImageFit,
  ItemTransform,
  MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import { MAX_LARGE_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'

type DbCtx = QueryCtx | MutationCtx

// effective per-item image fields for a style, at the mediaAssetId level
export interface StyleResolvedAsset
{
  mediaAssetId: Id<'mediaAssets'> | null
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
  mediaPlate: MediaPlate | null
  imagePadding: number | null
  altText: string | null
}

// the source shape both templateItems & templateItemStyleAssets satisfy
type StyleAssetSource = {
  mediaAssetId: Id<'mediaAssets'> | null
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
  mediaPlate?: MediaPlate | null
  imagePadding: number | null
  altText: string | null
}

// a styleExternalId names the default style when it's null/undefined or equals
// the template's defaultStyleId. default styles keep their images on
// templateItems, so they never touch templateItemStyleAssets
export const isDefaultStyleId = (
  defaultStyleId: string | null | undefined,
  styleExternalId: string | null | undefined
): boolean => !styleExternalId || styleExternalId === (defaultStyleId ?? null)

// resolve effective per-item image fields. styleAssetRow null (default style or
// item not overridden) -> the template item's own fields
export const resolveStyleItemAsset = (
  templateItem: StyleAssetSource,
  styleAssetRow: StyleAssetSource | null
): StyleResolvedAsset =>
{
  const src = styleAssetRow ?? templateItem
  return {
    mediaAssetId: src.mediaAssetId,
    aspectRatio: src.aspectRatio,
    imageFit: src.imageFit,
    transform: src.transform,
    mediaPlate: src.mediaPlate ?? null,
    imagePadding: src.imagePadding,
    altText: src.altText,
  }
}

// all style rows for a template, in display order
export const loadTemplateStyles = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateStyles'>[]> =>
  await ctx.db
    .query('templateStyles')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(64)

// one style row by externalId; null for the default/no style id
export const loadTemplateStyleRow = async (
  ctx: DbCtx,
  templateId: Id<'templates'>,
  styleExternalId: string | null | undefined
): Promise<Doc<'templateStyles'> | null> =>
{
  if (!styleExternalId) return null
  return await ctx.db
    .query('templateStyles')
    .withIndex('byTemplateAndExternalId', (q) =>
      q.eq('templateId', templateId).eq('externalId', styleExternalId)
    )
    .unique()
}

// resolve a requested style id to a valid one, falling back to the template
// default when it's absent or unknown
export const resolveEffectiveStyleId = (
  template: Pick<Doc<'templates'>, 'defaultStyleId'>,
  styles: readonly Pick<Doc<'templateStyles'>, 'externalId'>[],
  requestedStyleId: string | null | undefined
): string | null =>
{
  const defaultStyleId = template.defaultStyleId ?? null
  if (
    requestedStyleId &&
    isAllowedTemplateStyle(defaultStyleId, styles, requestedStyleId)
  )
  {
    return requestedStyleId
  }
  return defaultStyleId
}

// whether styleExternalId is selectable for this template. null/default always ok
export const isAllowedTemplateStyle = (
  defaultStyleId: string | null | undefined,
  styles: readonly Pick<Doc<'templateStyles'>, 'externalId'>[],
  styleExternalId: string | null | undefined
): boolean =>
{
  if (isDefaultStyleId(defaultStyleId, styleExternalId)) return true
  return styles.some((style) => style.externalId === styleExternalId)
}

// load all per-item style asset rows for a non-default style, keyed by item
// externalId. default style -> empty map (caller falls back to templateItems).
// bulk loader for the inline (<= standard) fork path
export const loadStyleItemAssets = async (
  ctx: DbCtx,
  templateId: Id<'templates'>,
  styleExternalId: string | null | undefined,
  defaultStyleId: string | null | undefined
): Promise<Map<string, Doc<'templateItemStyleAssets'>>> =>
{
  if (isDefaultStyleId(defaultStyleId, styleExternalId)) return new Map()
  const rows = await ctx.db
    .query('templateItemStyleAssets')
    .withIndex('byTemplateStyleAndItem', (q) =>
      q.eq('templateId', templateId).eq('styleExternalId', styleExternalId!)
    )
    .take(MAX_LARGE_CLOUD_BOARD_ITEMS + 1)
  if (rows.length > MAX_LARGE_CLOUD_BOARD_ITEMS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `style asset rows exceed ${MAX_LARGE_CLOUD_BOARD_ITEMS}`,
    })
  }
  return new Map(rows.map((row) => [row.itemExternalId, row]))
}

// point-lookup one item's style asset (paginated clone job / live-switch).
// default style or no override -> null (caller falls back to the template item)
export const resolveStyleItemAssetForItem = async (
  ctx: DbCtx,
  templateId: Id<'templates'>,
  styleExternalId: string | null | undefined,
  itemExternalId: string,
  defaultStyleId: string | null | undefined
): Promise<Doc<'templateItemStyleAssets'> | null> =>
{
  if (isDefaultStyleId(defaultStyleId, styleExternalId)) return null
  return await ctx.db
    .query('templateItemStyleAssets')
    .withIndex('byTemplateStyleAndItem', (q) =>
      q
        .eq('templateId', templateId)
        .eq('styleExternalId', styleExternalId!)
        .eq('itemExternalId', itemExternalId)
    )
    .unique()
}
