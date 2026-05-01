// convex/lib/mediaVariants.ts
// helpers for compact media-variant summaries denormalized onto mediaAssets

import type { Doc } from '../_generated/dataModel'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

export type MediaVariantSummary = Doc<'mediaAssets'>['tileVariant']

export const selectMediaVariantSummary = (
  asset: Doc<'mediaAssets'>,
  kind: MediaVariantKind
): MediaVariantSummary | undefined =>
{
  if (kind === 'tile') return asset.tileVariant
  if (kind === 'preview') return asset.previewVariant
  return asset.editorVariant
}
