// tests/shared-lib/autoCrop.test.ts
// auto-crop bbox-to-transform math & alpha bbox detection

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

describe('bboxToItemTransform', () =>
{
  it('contains tall/portrait bboxes inside the frame & crops padding when present', () =>
  {
    const tall = bboxToItemTransform(
      { left: 0.1, top: 0, right: 0.9, bottom: 1 },
      {
        imageAspectRatio: 8 / 9,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )
    expect(tall.zoom).toBeCloseTo(8 / 9, 6)
    expect(tall.offsetX).toBeCloseTo(0, 6)

    const padded = bboxToItemTransform(
      { left: 0.05, top: 0, right: 0.95, bottom: 0.96 },
      { imageAspectRatio: 8 / 9, boardAspectRatio: 1, rotation: 0 }
    )
    expect(padded.zoom).toBeGreaterThan(8 / 9)
    expect(padded.offsetY).toBeGreaterThan(0)
  })

  it('zooms up for fitting bboxes, clamps to zoomMin for extreme aspects, & centers off-axis bboxes', () =>
  {
    const fit = bboxToItemTransform(
      { left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 },
      {
        imageAspectRatio: 1,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )
    expect(fit.zoom).toBeCloseTo(2, 6)
    expect(fit.offsetX).toBeCloseTo(0, 6)

    const wide = bboxToItemTransform(
      { left: 0.25, top: 0, right: 0.75, bottom: 1 },
      {
        imageAspectRatio: 100,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )
    expect(wide.zoom).toBeGreaterThanOrEqual(ITEM_TRANSFORM_LIMITS.zoomMin)

    const offAxis = bboxToItemTransform(
      { left: 0.4, top: 0.25, right: 0.9, bottom: 0.75 },
      {
        imageAspectRatio: 1,
        boardAspectRatio: 1,
        rotation: 0,
        paddingFraction: 0,
      }
    )
    expect(offAxis.zoom).toBeCloseTo(2, 6)
    expect(offAxis.offsetX).toBeCloseTo(-0.3, 6)
  })
})

describe('detectContentBBoxFromImageData', () =>
{
  it('trims long soft-alpha tails, keeps short fringes, preserves tails when disabled, & accepts full-frame', () =>
  {
    expect(
      detectContentBBoxFromImageData(
        createAlphaImageData(100, 100, [
          { left: 20, top: 10, right: 80, bottom: 71, alpha: 255 },
          { left: 20, top: 71, right: 80, bottom: 96, alpha: 32 },
        ])
      )
    ).toEqual({ left: 0.2, top: 0.1, right: 0.8, bottom: 0.71 })

    expect(
      detectContentBBoxFromImageData(
        createAlphaImageData(100, 100, [
          { left: 18, top: 8, right: 82, bottom: 73, alpha: 32 },
          { left: 20, top: 10, right: 80, bottom: 71, alpha: 255 },
        ])
      )
    ).toEqual({ left: 0.18, top: 0.08, right: 0.82, bottom: 0.73 })

    expect(
      detectContentBBoxFromImageData(
        createAlphaImageData(100, 100, [
          { left: 20, top: 10, right: 80, bottom: 71, alpha: 255 },
          { left: 20, top: 71, right: 80, bottom: 96, alpha: 32 },
        ]),
        false
      )
    ).toEqual({ left: 0.2, top: 0.1, right: 0.8, bottom: 0.96 })

    expect(
      detectContentBBoxFromImageData(
        createAlphaImageData(100, 100, [
          { left: 0, top: 0, right: 100, bottom: 100, alpha: 255 },
          { left: 10, top: 10, right: 30, bottom: 30, alpha: 0 },
        ])
      )
    ).toEqual({ left: 0, top: 0, right: 1, bottom: 1 })
  })
})
