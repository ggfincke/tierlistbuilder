// packages/contracts/workspace/imageStyleSwitch.ts
// pure skin-switch logic shared by the local-first board store & the server
// switch mutation: which items re-point on a style switch & their new image
// fields. style-linked items follow the skin; pinned & user-added items don't

import type { TemplateMediaRef } from '../lib/coverMedia'
import type {
  ImageFit,
  ItemImageSource,
  ItemTransform,
  MediaPlate,
} from './board'

// replacement image fields a switch applies to a linked item (media-ref level)
export interface StyleSwitchAsset
{
  media: TemplateMediaRef | null
  mediaPlate: MediaPlate | null
  altText: string | null
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
  imagePadding: number | null
}

// image fields for an item absent in the target style: cleared image, the item
// stays in its tier so switching back restores it
export const ABSENT_STYLE_ASSET: StyleSwitchAsset = {
  media: null,
  mediaPlate: null,
  altText: null,
  aspectRatio: null,
  imageFit: null,
  transform: null,
  imagePadding: null,
}

// pinned items are user-owned (imported or manually recropped) & never re-point
export const isStylePinned = (item: {
  imageSource?: ItemImageSource
}): boolean => item.imageSource === 'pinned'

export interface StyleSwitchItemInput
{
  key: string
  imageSource?: ItemImageSource
  // join key to the source template item; absent -> user-added (never switches)
  sourceTemplateItemExternalId?: string
}

export interface StyleSwitchItemUpdate
{
  key: string
  asset: StyleSwitchAsset
}

// compute per-item image replacements for a skin switch. only style-linked,
// template-origin items change; pinned & user-added items are left untouched.
// an item missing from the target style resolves to ABSENT_STYLE_ASSET. the
// new image (incl. transform & aspect ratio) is the target style's, so a crop
// tied to the prior style's aspect ratio is naturally replaced
export const computeStyleSwitch = (
  items: readonly StyleSwitchItemInput[],
  assetsByTemplateItemExternalId: ReadonlyMap<string, StyleSwitchAsset>
): StyleSwitchItemUpdate[] =>
{
  const updates: StyleSwitchItemUpdate[] = []
  for (const item of items)
  {
    if (isStylePinned(item)) continue
    const sourceId = item.sourceTemplateItemExternalId
    if (!sourceId) continue
    const asset =
      assetsByTemplateItemExternalId.get(sourceId) ?? ABSENT_STYLE_ASSET
    updates.push({ key: item.key, asset })
  }
  return updates
}
