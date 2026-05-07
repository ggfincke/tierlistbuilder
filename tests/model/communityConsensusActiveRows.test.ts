// tests/model/communityConsensusActiveRows.test.ts
// selected-ranking row projection & filter behavior

import { describe, expect, it } from 'vitest'

import type { MarketplaceRankingItem } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateRankingAggregateItem } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  buildRowsForActiveRanking,
  filterAndSortActiveRankingRows,
} from '~/features/marketplace/components/consensus/activeRankingRows'

const rankingItem = (
  templateItemExternalId: string,
  label: string,
  order: number
): MarketplaceRankingItem => ({
  externalId: `ranking-${templateItemExternalId}`,
  templateItemExternalId,
  tierExternalId: null,
  label,
  backgroundColor: null,
  altText: null,
  media: null,
  order,
  aspectRatio: null,
  imageFit: null,
  transform: null,
})

const rowIds = (
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
): string[] => rows.map((row) => row.templateItemExternalId)

describe('active ranking consensus rows', () =>
{
  it('projects selected-author placements before applying band, search, & consensusTop filters', () =>
  {
    const rows = buildRowsForActiveRanking(
      [
        rankingItem('author-top', 'Alpha top', 0),
        rankingItem('author-mid', 'Middle', 1),
        rankingItem('author-bottom', 'Zed bottom', 2),
        rankingItem('unranked', 'Loose', 3),
      ],
      {
        'author-top': 0,
        'author-mid': 2,
        'author-bottom': 5,
      },
      6
    )
    const bottom = rows.find(
      (row) => row.templateItemExternalId === 'author-bottom'
    )

    expect(bottom).toMatchObject({
      topBucketIndex: 5,
      averageBucket: 5,
      sampleCount: 1,
      isBottomBucket: true,
      isTopBucket: false,
    })
    expect(bottom?.distribution[5]).toEqual({
      bucketIndex: 5,
      count: 1,
      share: 1,
    })

    const officialRows = buildRowsForActiveRanking(
      [
        rankingItem('official-mid', 'Mid', 0),
        rankingItem('official-bottom', 'Bottom', 1),
      ],
      {
        'official-mid': 5,
        'official-bottom': 11,
      },
      12
    )

    expect(
      officialRows.find((row) => row.templateItemExternalId === 'official-mid')
        ?.isBottomBucket
    ).toBe(false)
    expect(
      officialRows.find(
        (row) => row.templateItemExternalId === 'official-bottom'
      )?.isBottomBucket
    ).toBe(true)
    expect(
      rowIds(
        filterAndSortActiveRankingRows(rows, {
          band: 'top',
          bucketCount: 6,
          search: '',
          sort: 'templateOrder',
        })
      )
    ).toEqual(['author-top'])
    expect(
      rowIds(
        filterAndSortActiveRankingRows(rows, {
          band: 'bottom',
          bucketCount: 6,
          search: '',
          sort: 'templateOrder',
        })
      )
    ).toEqual(['author-bottom'])
    expect(
      rowIds(
        filterAndSortActiveRankingRows(rows, {
          band: 'all',
          bucketCount: 6,
          search: '',
          sort: 'consensusTop',
        })
      )
    ).toEqual(['author-top'])
    expect(
      rowIds(
        filterAndSortActiveRankingRows(rows, {
          band: 'bottom',
          bucketCount: 6,
          search: 'zed',
          sort: 'templateOrder',
        })
      )
    ).toEqual(['author-bottom'])
    expect(
      rowIds(
        filterAndSortActiveRankingRows(rows, {
          band: 'controversial',
          bucketCount: 6,
          search: '',
          sort: 'templateOrder',
        })
      )
    ).toEqual([])
  })
})
