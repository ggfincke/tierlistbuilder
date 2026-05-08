// src/shared/lib/imageRefs.ts
// helpers for the three-rendition image bundle (preview / tile / source);
// centralizes per-use-case priority ordering — see PRIORITY_ORDER below

import type { TierItemImageRef } from '@tierlistbuilder/contracts/workspace/board'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

// minimal shape needed by the helpers — accepts both TierItem & wire variants
export interface ItemImageBundle
{
  imageRef?: TierItemImageRef
  tileImageRef?: TierItemImageRef
  sourceImageRef?: TierItemImageRef
}

export type RenditionKey = keyof ItemImageBundle

interface ImageRenditionRef
{
  ref: TierItemImageRef
  variant: MediaVariantKind
}

// rendition modes describe the consumer's quality-vs-cost preference. board
// = visible tiles (tile-first); thumbnail = icon previews (preview-first);
// editor = canvas / auto-crop / export (source-first)
export type ImageRendition = 'board' | 'thumbnail' | 'editor'

export const PRIORITY_ORDER: Record<ImageRendition, readonly RenditionKey[]> = {
  board: ['tileImageRef', 'sourceImageRef', 'imageRef'],
  thumbnail: ['imageRef', 'tileImageRef', 'sourceImageRef'],
  editor: ['sourceImageRef', 'tileImageRef', 'imageRef'],
}

const VARIANT_BY_KEY: Record<RenditionKey, MediaVariantKind> = {
  imageRef: 'preview',
  tileImageRef: 'tile',
  sourceImageRef: 'editor',
}

// [fieldName, ref] tuples in priority order. callers that need the field name
// (e.g. for error messages) iterate this; callers that just want refs use
// getImageRefsByRendition / getPrimaryImageRef
export const getRenditionEntries = (
  item: ItemImageBundle,
  rendition: ImageRendition
): readonly (readonly [RenditionKey, TierItemImageRef | undefined])[] =>
  PRIORITY_ORDER[rendition].map((key) => [key, item[key]] as const)

export const hasAnyImageRef = (item: ItemImageBundle): boolean =>
  !!(item.imageRef || item.tileImageRef || item.sourceImageRef)

// every available ref for the item, deduped & ordered by rendition priority
export const getImageRefsByRendition = (
  item: ItemImageBundle,
  rendition: ImageRendition
): TierItemImageRef[] =>
  getImageRenditionRefs(item, rendition).map(({ ref }) => ref)

export const getImageRenditionRefs = (
  item: ItemImageBundle,
  rendition: ImageRendition
): ImageRenditionRef[] =>
{
  const seen = new Set<string>()
  const result: ImageRenditionRef[] = []
  for (const key of PRIORITY_ORDER[rendition])
  {
    const ref = item[key]
    if (!ref || seen.has(ref.hash)) continue
    seen.add(ref.hash)
    result.push({ ref, variant: VARIANT_BY_KEY[key] })
  }
  return result
}

// best-quality ref for the rendition; undefined when the item has no image bytes
export const getPrimaryImageRef = (
  item: ItemImageBundle,
  rendition: ImageRendition
): TierItemImageRef | undefined => getImageRefsByRendition(item, rendition)[0]

export const getRenderImageRefs = (
  item: ItemImageBundle,
  rendition: ImageRendition
): {
  primary: ImageRenditionRef | undefined
  fallback: ImageRenditionRef | undefined
} =>
{
  const refs = getImageRenditionRefs(item, rendition)
  const primary = refs[0]
  if (!primary) return { primary: undefined, fallback: undefined }

  const fallbackRef = pickFallbackRef(item, rendition, refs, primary)
  return { primary, fallback: fallbackRef }
}

const pickFallbackRef = (
  item: ItemImageBundle,
  rendition: ImageRendition,
  refs: readonly ImageRenditionRef[],
  primary: ImageRenditionRef
): ImageRenditionRef | undefined =>
{
  if (rendition !== 'board') return refs[1]
  // board renders prefer the preview thumb as warm-up (fastest decode) rather
  // than walking the priority list — but only when it differs from primary
  if (!item.imageRef || item.imageRef.hash === primary.ref.hash)
  {
    return undefined
  }
  return { ref: item.imageRef, variant: VARIANT_BY_KEY.imageRef }
}
