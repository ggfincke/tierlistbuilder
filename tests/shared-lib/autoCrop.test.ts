// tests/shared-lib/autoCrop.test.ts
// auto-crop bbox-to-transform math

import { describe, expect, it } from 'vitest'

import { padBBox } from '@tierlistbuilder/contracts/workspace/autoCrop'

import {
  bboxToItemTransform,
  detectContentBBoxFromImageData,
} from '~/shared/lib/auto-crop/pipeline'

interface AlphaRect
{
  left: number
  top: number
  right: number
  bottom: number
  alpha: number
}

interface OpaqueRect
{
  left: number
  top: number
  right: number
  bottom: number
  color: [number, number, number]
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

const createOpaqueImageData = (
  width: number,
  height: number,
  baseColor: [number, number, number],
  rects: readonly OpaqueRect[]
): ImageData =>
{
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
  {
    for (let x = 0; x < width; x++)
    {
      const i = (y * width + x) << 2
      data[i] = baseColor[0]
      data[i + 1] = baseColor[1]
      data[i + 2] = baseColor[2]
      data[i + 3] = 255
    }
  }
  for (const rect of rects)
  {
    for (let y = rect.top; y < rect.bottom; y++)
    {
      for (let x = rect.left; x < rect.right; x++)
      {
        const i = (y * width + x) << 2
        data[i] = rect.color[0]
        data[i + 1] = rect.color[1]
        data[i + 2] = rect.color[2]
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

describe('bbox padding helpers', () =>
{
  it('clamps padded bboxes by default', () =>
  {
    expect(
      padBBox(
        {
          left: 0.01,
          top: 0.02,
          right: 0.98,
          bottom: 0.99,
        },
        0.05
      )
    ).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    })
  })

  it('can preserve out-of-bounds cover frames', () =>
  {
    const padded = padBBox(
      {
        left: 0.01,
        top: 0.02,
        right: 0.98,
        bottom: 0.99,
      },
      0.05,
      { clamp: false }
    )

    expect(padded.left).toBeCloseTo(-0.04)
    expect(padded.top).toBeCloseTo(-0.03)
    expect(padded.right).toBeCloseTo(1.03)
    expect(padded.bottom).toBeCloseTo(1.04)
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

  it('detects opaque poster art against a corner matte', () =>
  {
    const bbox = detectContentBBoxFromImageData(
      createOpaqueImageData(
        60,
        90,
        [12, 14, 18],
        [{ left: 18, top: 20, right: 42, bottom: 70, color: [220, 170, 80] }]
      )
    )

    expect(bbox).toEqual({
      left: 0.3,
      top: 2 / 9,
      right: 0.7,
      bottom: 7 / 9,
    })
  })
})
