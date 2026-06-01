// tests/convex/styleResolution.test.ts
// Guard image-style resolution precedence & the style allow-list.

import { describe, expect, it } from 'vitest'
import type { Id } from '@convex/_generated/dataModel'
import {
  isAllowedTemplateStyle,
  isDefaultStyleId,
  resolveStyleItemAsset,
} from '@convex/marketplace/templates/lib/styles'

const mediaId = (value: string): Id<'mediaAssets'> => value as Id<'mediaAssets'>

const templateItemFields = {
  mediaAssetId: mediaId('media_default'),
  aspectRatio: 1,
  imageFit: 'cover' as const,
  transform: null,
  mediaPlate: null,
  imagePadding: 0.1,
  altText: 'default alt',
}

describe('isDefaultStyleId', () =>
{
  it('treats null/undefined & the default externalId as the default style', () =>
  {
    expect(isDefaultStyleId('official', null)).toBe(true)
    expect(isDefaultStyleId('official', undefined)).toBe(true)
    expect(isDefaultStyleId('official', 'official')).toBe(true)
    expect(isDefaultStyleId('official', 'pixel')).toBe(false)
    expect(isDefaultStyleId(null, null)).toBe(true)
  })
})

describe('resolveStyleItemAsset', () =>
{
  it('falls back to the template item when there is no style override', () =>
  {
    expect(resolveStyleItemAsset(templateItemFields, null)).toEqual({
      mediaAssetId: mediaId('media_default'),
      aspectRatio: 1,
      imageFit: 'cover',
      transform: null,
      mediaPlate: null,
      imagePadding: 0.1,
      altText: 'default alt',
    })
  })

  it('uses the style asset row when the item is overridden', () =>
  {
    const styleRow = {
      mediaAssetId: mediaId('media_pixel'),
      aspectRatio: 1.2,
      imageFit: 'contain' as const,
      transform: null,
      mediaPlate: 'dark' as const,
      imagePadding: 0,
      altText: 'pixel alt',
    }
    expect(resolveStyleItemAsset(templateItemFields, styleRow)).toEqual({
      mediaAssetId: mediaId('media_pixel'),
      aspectRatio: 1.2,
      imageFit: 'contain',
      transform: null,
      mediaPlate: 'dark',
      imagePadding: 0,
      altText: 'pixel alt',
    })
  })

  it('passes through null media (item absent in the style)', () =>
  {
    const styleRow = {
      mediaAssetId: null,
      aspectRatio: null,
      imageFit: null,
      transform: null,
      mediaPlate: null,
      imagePadding: null,
      altText: null,
    }
    expect(resolveStyleItemAsset(templateItemFields, styleRow).mediaAssetId).toBeNull()
  })
})

describe('isAllowedTemplateStyle', () =>
{
  const styles = [{ externalId: 'official' }, { externalId: 'pixel' }]

  it('allows the default style (null or default id)', () =>
  {
    expect(isAllowedTemplateStyle('official', styles, null)).toBe(true)
    expect(isAllowedTemplateStyle('official', styles, 'official')).toBe(true)
  })

  it('allows a listed style', () =>
  {
    expect(isAllowedTemplateStyle('official', styles, 'pixel')).toBe(true)
  })

  it('rejects an unknown style', () =>
  {
    expect(isAllowedTemplateStyle('official', styles, 'shiny')).toBe(false)
  })
})
