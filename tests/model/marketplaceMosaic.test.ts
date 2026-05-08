// tests/model/marketplaceMosaic.test.ts
// marketplace mosaic grid sizing behavior

import { describe, expect, it } from 'vitest'

import { computeGridDims } from '../../src/features/marketplace/components/discovery/mosaicGrid'

describe('computeGridDims', () =>
{
  it('allocates a slot for every item until the density cap', () =>
  {
    const fourItemDefault = computeGridDims(4, 18, 16 / 9, 1)
    expect(fourItemDefault.cols * fourItemDefault.rows).toBeGreaterThanOrEqual(
      4
    )

    for (const maxSlots of [12, 18, 24, 80])
    {
      for (const coverAspect of [0.75, 1, 16 / 9, 2.8])
      {
        for (const cellAspect of [2 / 3, 1, 16 / 9])
        {
          for (let itemCount = 1; itemCount <= maxSlots; itemCount++)
          {
            const dims = computeGridDims(
              itemCount,
              maxSlots,
              coverAspect,
              cellAspect
            )
            const slotCount = dims.cols * dims.rows
            expect(slotCount).toBeGreaterThanOrEqual(itemCount)
            expect(slotCount).toBeLessThanOrEqual(maxSlots)
          }
        }
      }

      const capped = computeGridDims(maxSlots + 10, maxSlots, 16 / 9, 1)
      expect(capped.cols * capped.rows).toBe(maxSlots)
    }
  })
})
