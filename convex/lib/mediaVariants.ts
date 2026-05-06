// convex/lib/mediaVariants.ts
// helpers for compact media-variant summaries denormalized onto mediaAssets

import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

export type MediaVariantSummary = Doc<'mediaAssets'>['tileVariant']
type DbCtx = MutationCtx | QueryCtx

export const selectMediaVariantSummary = (
  asset: Doc<'mediaAssets'>,
  kind: MediaVariantKind
): MediaVariantSummary | undefined =>
{
  if (kind === 'tile') return asset.tileVariant
  if (kind === 'preview') return asset.previewVariant
  return asset.editorVariant
}

export const loadMediaVariantStorageId = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null,
  kind: MediaVariantKind = 'tile'
): Promise<Id<'_storage'> | null> =>
{
  if (!mediaAssetId) return null
  const asset = await ctx.db.get(mediaAssetId)
  if (!asset) return null
  return selectMediaVariantSummary(asset, kind)?.storageId ?? null
}
