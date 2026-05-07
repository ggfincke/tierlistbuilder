// tests/scripts/marketplaceSeedImages.test.ts
// marketplace seed image preparation ratio selection

import { describe, expect, it } from 'vitest'

import { prepareFolder } from '../../scripts/marketplace-seed/images'
import type { ProbedItem } from '../../scripts/marketplace-seed/types'

const fullImageBBox = {
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
}

const probe = (
  label: string,
  aspectRatio: number,
  bbox: ProbedItem['bbox'] = null
): ProbedItem => ({
  label,
  filePath: `/tmp/${label}.jpg`,
  byteSize: 1,
  aspectRatio,
  bbox,
})

describe('prepareFolder', () =>
{
  it('uses the dominant ratio for mixed folders & crops outliers', () =>
  {
    const result = prepareFolder([
      probe('poster-1', 2 / 3),
      probe('poster-2', 2 / 3),
      probe('poster-3', 2 / 3),
      probe('poster-4', 2 / 3),
      probe('square-outlier', 1, fullImageBBox),
      probe('wide-outlier', 16 / 9, fullImageBBox),
    ])

    expect(result.ratioSource).toBe('mixed-dominant')
    expect(result.templateRatio).toBeCloseTo(2 / 3)
    expect(
      result.items.slice(0, 4).every((item) => item.transform === null)
    ).toBe(true)
    expect(result.items[4]?.transform).not.toBeNull()
    expect(result.items[5]?.transform).not.toBeNull()
  })

  it('falls back to square when mixed folders have no majority ratio', () =>
  {
    const result = prepareFolder([
      probe('poster', 2 / 3),
      probe('square', 1),
      probe('wide', 16 / 9),
    ])

    expect(result.ratioSource).toBe('mixed-square')
    expect(result.templateRatio).toBe(1)
  })
})
