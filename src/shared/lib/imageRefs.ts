// src/shared/lib/imageRefs.ts
// helpers for the three-rendition image bundle (preview / tile / source);
// centralizes per-use-case priority ordering — see PRIORITY_ORDER below

import type { TierItemImageRef } from '@tierlistbuilder/contracts/workspace/board'

// minimal shape needed by the helpers — accepts both TierItem & wire variants
export interface ItemImageBundle
{
  imageRef?: TierItemImageRef
  tileImageRef?: TierItemImageRef
  sourceImageRef?: TierItemImageRef
}

type RenditionKey = keyof ItemImageBundle

// rendition modes describe the consumer's quality-vs-cost preference. board
// = visible tiles (tile-first); thumbnail = icon previews (preview-first);
// editor = canvas / auto-crop / export (source-first)
export const IMAGE_RENDITIONS = ['board', 'thumbnail', 'editor'] as const
export type ImageRendition = (typeof IMAGE_RENDITIONS)[number]

const PRIORITY_ORDER: Record<ImageRendition, readonly RenditionKey[]> = {
  board: ['tileImageRef', 'sourceImageRef', 'imageRef'],
  thumbnail: ['imageRef', 'tileImageRef', 'sourceImageRef'],
  editor: ['sourceImageRef', 'tileImageRef', 'imageRef'],
}

export const hasAnyImageRef = (item: ItemImageBundle): boolean =>
  !!(item.imageRef || item.tileImageRef || item.sourceImageRef)

// every available ref for the item, deduped & ordered by rendition priority
export const getImageRefsByRendition = (
  item: ItemImageBundle,
  rendition: ImageRendition
): TierItemImageRef[] =>
{
  const seen = new Set<string>()
  const result: TierItemImageRef[] = []
  for (const key of PRIORITY_ORDER[rendition])
  {
    const ref = item[key]
    if (!ref || seen.has(ref.hash)) continue
    seen.add(ref.hash)
    result.push(ref)
  }
  return result
}

// best-quality ref for the rendition; undefined when the item has no image bytes
export const getPrimaryImageRef = (
  item: ItemImageBundle,
  rendition: ImageRendition
): TierItemImageRef | undefined => getImageRefsByRendition(item, rendition)[0]

// primary hash + a warm-up fallback hash shown while the primary decodes.
// 'board' uses preview as warm-up (fastest first paint); other renditions
// fall through the priority list so warm-up degrades gracefully on quality
export const getRenderImageHashes = (
  item: ItemImageBundle,
  rendition: ImageRendition
): { primary: string | undefined; fallback: string | undefined } =>
{
  const refs = getImageRefsByRendition(item, rendition)
  const primary = refs[0]
  if (!primary) return { primary: undefined, fallback: undefined }

  const fallbackRef = pickFallbackRef(item, rendition, refs, primary)
  return { primary: primary.hash, fallback: fallbackRef?.hash }
}

const pickFallbackRef = (
  item: ItemImageBundle,
  rendition: ImageRendition,
  refs: readonly TierItemImageRef[],
  primary: TierItemImageRef
): TierItemImageRef | undefined =>
{
  if (rendition !== 'board') return refs[1]
  // board renders prefer the preview thumb as warm-up (fastest decode) rather
  // than walking the priority list — but only when it differs from primary
  if (!item.imageRef || item.imageRef.hash === primary.hash) return undefined
  return item.imageRef
}
