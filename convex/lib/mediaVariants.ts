// convex/lib/mediaVariants.ts
// helpers for compact media-variant summaries denormalized onto mediaAssets

import {
  MAX_MEDIA_VARIANTS_PER_ASSET,
  type MediaVariantKind,
} from '@tierlistbuilder/contracts/platform/media'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { failInput } from './text'

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

// preview-first storage lookup for surfaces that render the asset at hero
// scale (board card mosaics, marketplace covers). tile fallback covers
// assets predating the preview pipeline so callers can swap in unconditionally
export const selectPreviewOrTileStorageId = (
  asset: Doc<'mediaAssets'>
): Id<'_storage'> =>
  asset.previewVariant?.storageId ?? asset.tileVariant.storageId

export const loadPreviewOrTileStorageId = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null
): Promise<Id<'_storage'> | null> =>
{
  if (!mediaAssetId) return null
  const asset = await ctx.db.get(mediaAssetId)
  if (!asset) return null
  return selectPreviewOrTileStorageId(asset)
}

// canonical owner-scoped fingerprint for verified-variant dedupe. used by both
// the user upload finalize path & the seed pipeline finalize path so the
// `mediaAssets.dedupeHash` formula stays consistent regardless of caller
export const computeVariantDedupeHash = (
  variants: readonly { kind: MediaVariantKind; contentHash: string }[]
): string =>
  variants
    .map((variant) => `${variant.kind}:${variant.contentHash}`)
    .sort()
    .join('|')

// shared kind/count/tile-presence guard for finalize-time variant payloads.
// onInvalidKindSet runs before duplicate/missing-tile throws so callers can
// clean up rejected blobs before bubbling the error
export const assertValidVariantRequest = async (
  variants: readonly { kind: MediaVariantKind }[],
  onInvalidKindSet?: () => Promise<void>,
  messages: { invalidCount?: string } = {}
): Promise<void> =>
{
  if (variants.length < 1 || variants.length > MAX_MEDIA_VARIANTS_PER_ASSET)
  {
    failInput(
      messages.invalidCount ??
        `variants must include 1..${MAX_MEDIA_VARIANTS_PER_ASSET} entries`
    )
  }
  const seen = new Set<MediaVariantKind>()
  for (const variant of variants)
  {
    if (seen.has(variant.kind))
    {
      if (onInvalidKindSet) await onInvalidKindSet()
      failInput(`duplicate media variant kind: ${variant.kind}`)
    }
    seen.add(variant.kind)
  }
  if (!seen.has('tile'))
  {
    if (onInvalidKindSet) await onInvalidKindSet()
    failInput('media asset finalization requires a tile variant')
  }
}
