// tests/board/imageStyleSwitch.test.ts
// Guard skin-switch selection: linked items re-point; pinned & user-added don't.

import { describe, expect, it } from 'vitest'
import {
  ABSENT_STYLE_ASSET,
  computeStyleSwitch,
  isStylePinned,
  type StyleSwitchAsset,
} from '@tierlistbuilder/contracts/workspace/imageStyleSwitch'

const asset = (id: string): StyleSwitchAsset => ({
  media: {
    externalId: id,
    contentHash: id,
    url: `blob:${id}`,
    width: 1,
    height: 1,
    mimeType: 'image/webp',
  },
  mediaPlate: null,
  altText: null,
  aspectRatio: 1,
  imageFit: 'cover',
  transform: null,
  imagePadding: null,
})

describe('isStylePinned', () =>
{
  it('is true only for pinned items', () =>
  {
    expect(isStylePinned({ imageSource: 'pinned' })).toBe(true)
    expect(isStylePinned({ imageSource: 'linked' })).toBe(false)
    expect(isStylePinned({})).toBe(false)
  })
})

describe('computeStyleSwitch', () =>
{
  const targetAssets = new Map([['bulbasaur', asset('pixel_bulba')]])

  it('re-points a linked, template-origin item', () =>
  {
    const updates = computeStyleSwitch(
      [
        {
          key: 'i1',
          imageSource: 'linked',
          sourceTemplateItemExternalId: 'bulbasaur',
        },
      ],
      targetAssets
    )
    expect(updates).toEqual([{ key: 'i1', asset: asset('pixel_bulba') }])
  })

  it('skips pinned items', () =>
  {
    const updates = computeStyleSwitch(
      [
        {
          key: 'i1',
          imageSource: 'pinned',
          sourceTemplateItemExternalId: 'bulbasaur',
        },
      ],
      targetAssets
    )
    expect(updates).toEqual([])
  })

  it('skips user-added items with no source template item', () =>
  {
    const updates = computeStyleSwitch(
      [{ key: 'i1', imageSource: 'linked' }],
      targetAssets
    )
    expect(updates).toEqual([])
  })

  it('clears the image for an item absent in the target style', () =>
  {
    const updates = computeStyleSwitch(
      [{ key: 'i1', sourceTemplateItemExternalId: 'mewtwo' }],
      targetAssets
    )
    expect(updates).toEqual([{ key: 'i1', asset: ABSENT_STYLE_ASSET }])
  })
})
