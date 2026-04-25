// tests/shared-lib/imageTransform.test.ts
// manual crop image sizing & positioning helpers

import { describe, expect, it } from 'vitest'

import {
  itemTransformToCropCss,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'

describe('manual crop image helpers', () =>
{
  it('sizes portrait images beyond a square crop frame', () =>
  {
    expect(resolveManualCropImageSize(2 / 3, 1, 0)).toEqual({
      widthPercent: 100,
      heightPercent: 150,
    })
  })

  it('accounts for quarter-turn rotation when sizing the crop image', () =>
  {
    expect(resolveManualCropImageSize(2 / 3, 1, 90)).toEqual({
      widthPercent: 100,
      heightPercent: 150,
    })
  })

  it('positions pan offsets in frame-relative percentages', () =>
  {
    expect(
      itemTransformToCropCss({
        rotation: 0,
        zoom: 1.25,
        offsetX: 0.2,
        offsetY: -0.1,
      })
    ).toEqual({
      left: '70.0000%',
      top: '40.0000%',
      transform: 'translate(-50%, -50%) scale(1.25) rotate(0deg)',
    })
  })
})
