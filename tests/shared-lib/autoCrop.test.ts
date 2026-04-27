// tests/shared-lib/autoCrop.test.ts
// auto-crop bbox-to-transform math

import { describe, expect, it } from 'vitest'

import { ITEM_TRANSFORM_LIMITS } from '@tierlistbuilder/contracts/workspace/board'
import { bboxToItemTransform } from '@tierlistbuilder/contracts/workspace/imageMath'
import { detectContentBBoxFromImageData } from '~/shared/lib/autoCrop'

interface AlphaRect
{
  left: number
  top: number
  right: number
  bottom: number
  alpha: number
}

const createAlphaImageData = (
  width: number,
  height: number,
  rects: readonly AlphaRect[]
): ImageData =>
{
  const data = new Uint8ClampedArray(width * height * 4)
  for (const rect of rects)
  {
    for (let y = rect.top; y < rect.bottom; y++)
    {
      for (let x = rect.left; x < rect.right; x++)
      {
        const i = (y * width + x) << 2
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        data[i + 3] = rect.alpha
      }
    }
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

describe('auto-crop transform helpers', () =>
{
  it('contains a tall detected bbox instead of covering the frame', () =>
  {
    const transform = bboxToItemTransform(
      {
        left: 0.1,
        top: 0,
        right: 0.9,
        bottom: 1,
      },
      {
        imageAspectRatio: 8 / 9,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )

    expect(transform.zoom).toBeCloseTo(8 / 9, 6)
    expect(transform.offsetX).toBeCloseTo(0, 6)
    expect(transform.offsetY).toBeCloseTo(0, 6)
  })

  it('contains a full portrait source image in a square frame', () =>
  {
    const transform = bboxToItemTransform(
      {
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
      },
      {
        imageAspectRatio: 5 / 7,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )

    expect(transform.zoom).toBeCloseTo(5 / 7, 6)
    expect(transform.offsetX).toBeCloseTo(0, 6)
    expect(transform.offsetY).toBeCloseTo(0, 6)
  })

  it('still crops source padding near one edge', () =>
  {
    const transform = bboxToItemTransform(
      {
        left: 0.05,
        top: 0,
        right: 0.95,
        bottom: 0.96,
      },
      {
        imageAspectRatio: 8 / 9,
        boardAspectRatio: 1,
        rotation: 0,
      }
    )

    expect(transform.zoom).toBeGreaterThan(8 / 9)
    expect(transform.offsetY).toBeGreaterThan(0)
  })

  it('zooms up when the padded bbox fits inside both frame axes', () =>
  {
    const transform = bboxToItemTransform(
      {
        left: 0.25,
        top: 0.25,
        right: 0.75,
        bottom: 0.75,
      },
      {
        imageAspectRatio: 1,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )

    expect(transform.zoom).toBeCloseTo(2, 6)
    expect(transform.offsetX).toBeCloseTo(0, 6)
    expect(transform.offsetY).toBeCloseTo(0, 6)
  })

  it('allows wide content to fit below the old 10 percent floor', () =>
  {
    const transform = bboxToItemTransform(
      {
        left: 0.25,
        top: 0,
        right: 0.75,
        bottom: 1,
      },
      {
        imageAspectRatio: 100,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )

    expect(transform.zoom).toBeCloseTo(0.02, 6)
    expect(transform.zoom).toBeGreaterThanOrEqual(ITEM_TRANSFORM_LIMITS.zoomMin)
  })

  it('centers an off-axis bbox after fitting it inside the frame', () =>
  {
    const transform = bboxToItemTransform(
      {
        left: 0.4,
        top: 0.25,
        right: 0.9,
        bottom: 0.75,
      },
      {
        imageAspectRatio: 1,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )

    expect(transform.zoom).toBeCloseTo(2, 6)
    expect(transform.offsetX).toBeCloseTo(-0.3, 6)
    expect(transform.offsetY).toBeCloseTo(0, 6)
  })
})

describe('auto-crop bbox detection', () =>
{
  it('trims one-sided soft alpha tails', () =>
  {
    const bbox = detectContentBBoxFromImageData(
      createAlphaImageData(100, 100, [
        { left: 20, top: 10, right: 80, bottom: 71, alpha: 255 },
        { left: 20, top: 71, right: 80, bottom: 96, alpha: 32 },
      ])
    )

    expect(bbox).toEqual({
      left: 0.2,
      top: 0.1,
      right: 0.8,
      bottom: 0.71,
    })
  })

  it('keeps short soft alpha fringes', () =>
  {
    const bbox = detectContentBBoxFromImageData(
      createAlphaImageData(100, 100, [
        { left: 18, top: 8, right: 82, bottom: 73, alpha: 32 },
        { left: 20, top: 10, right: 80, bottom: 71, alpha: 255 },
      ])
    )

    expect(bbox).toEqual({
      left: 0.18,
      top: 0.08,
      right: 0.82,
      bottom: 0.73,
    })
  })

  it('keeps soft alpha tails when trimming is disabled', () =>
  {
    const bbox = detectContentBBoxFromImageData(
      createAlphaImageData(100, 100, [
        { left: 20, top: 10, right: 80, bottom: 71, alpha: 255 },
        { left: 20, top: 71, right: 80, bottom: 96, alpha: 32 },
      ]),
      false
    )

    expect(bbox).toEqual({
      left: 0.2,
      top: 0.1,
      right: 0.8,
      bottom: 0.96,
    })
  })

  it('keeps full-image bboxes so ratio changes can still be framed', () =>
  {
    const bbox = detectContentBBoxFromImageData(
      createAlphaImageData(100, 100, [
        { left: 0, top: 0, right: 100, bottom: 100, alpha: 255 },
        { left: 10, top: 10, right: 30, bottom: 30, alpha: 0 },
      ])
    )

    expect(bbox).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    })
  })
})
