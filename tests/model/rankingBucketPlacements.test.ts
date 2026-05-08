// tests/model/rankingBucketPlacements.test.ts
// ranking tier-to-bucket normalization

import { describe, expect, it } from 'vitest'

import { buildRankingBucketPlacements } from '@tierlistbuilder/contracts/marketplace/ranking'

const tier = (externalId: string, name: string, order: number) => ({
  externalId,
  name,
  order,
})

const item = (templateItemExternalId: string, tierExternalId: string) => ({
  templateItemExternalId,
  tierExternalId,
})

describe('ranking bucket placements', () =>
{
  it('collapses named subtiers onto matching template buckets before falling back to order', () =>
  {
    expect(
      buildRankingBucketPlacements(
        [
          tier('s-plus', 'S+', 0),
          tier('s-minus', 'S-', 1),
          tier('a-plus', 'A+', 2),
          tier('chaos', 'Chaos', 3),
        ],
        [
          item('steve', 's-plus'),
          item('joker', 's-minus'),
          item('mario', 'a-plus'),
          item('wild', 'chaos'),
        ],
        6,
        ['S', 'A', 'B', 'C', 'D', 'E']
      )
    ).toEqual({
      steve: 0,
      joker: 0,
      mario: 1,
      wild: 3,
    })
  })
})
