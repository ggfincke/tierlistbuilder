// tests/shared-lib/autoCrop.test.ts
// auto-crop bbox-to-transform math

import { describe, expect, it } from 'vitest'

import { ITEM_TRANSFORM_LIMITS } from '@tierlistbuilder/contracts/workspace/board'
import { bboxToItemTransform } from '~/shared/lib/autoCrop'

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
