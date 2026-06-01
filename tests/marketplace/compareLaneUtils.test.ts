// tests/marketplace/compareLaneUtils.test.ts
// Cover compare-lane math where tier order makes smaller indexes higher.

import { describe, expect, it } from 'vitest'
import type { MarketplaceTemplateRankingAggregateItem } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  compareDirectionCopy,
  joinLanesByTemplateItem,
} from '~/features/marketplace/ui/consensus/compare/laneUtils'

const aggregateItem = (
  templateItemExternalId: string,
  topBucketIndex: number | null
): MarketplaceTemplateRankingAggregateItem => ({
  externalId: templateItemExternalId,
  templateItemExternalId,
  label: templateItemExternalId,
  backgroundColor: null,
  mediaPlate: null,
  altText: null,
  media: null,
  order: 0,
  aspectRatio: null,
  imageFit: null,
  transform: null,
  imagePadding: null,
  sampleCount: 1,
  averageBucket: topBucketIndex,
  topBucketIndex,
  topBucketShare: 1,
  consensusScore: 1,
  controversyScore: 0,
  controversyPercentile: 0,
  agreementPercentile: 1,
  isTopBucket: topBucketIndex === 0,
  isBottomBucket: topBucketIndex === 2,
  isControversial: false,
  distribution:
    topBucketIndex === null
      ? []
      : [{ bucketIndex: topBucketIndex, count: 1, share: 1 }],
})

describe('compare lane utils', () =>
{
  it('signs tier deltas according to higher lane direction', () =>
  {
    const [leftHigher, rightHigher] = joinLanesByTemplateItem(
      [aggregateItem('left-higher', 0), aggregateItem('right-higher', 2)],
      [aggregateItem('left-higher', 2), aggregateItem('right-higher', 0)]
    )

    expect(leftHigher).toMatchObject({ delta: -2, absDelta: 2 })
    expect(rightHigher).toMatchObject({ delta: 2, absDelta: 2 })
    expect(compareDirectionCopy(leftHigher.delta, 'Left', 'Right')).toBe(
      'Higher in Left'
    )
    expect(compareDirectionCopy(rightHigher.delta, 'Left', 'Right')).toBe(
      'Higher in Right'
    )
  })
})
