// tests/convex/shortLinksListing.test.ts
// short-link recent-share listing selection

import { describe, expect, it } from 'vitest'
import { MAX_OWNED_SHORT_LINKS } from '@tierlistbuilder/contracts/platform/shortLink'
import {
  selectLiveOwnedShortLinks,
  type OwnedShortLinkRow,
} from '../../convex/platform/shortLinks/listing'

const makeRow = (
  slug: string,
  createdAt: number,
  expiresAt: number
): OwnedShortLinkRow => ({
  slug,
  boardTitle: `Board ${slug}`,
  createdAt,
  expiresAt,
})

describe('short link listing selection', () =>
{
  it('filters expired rows before applying the owned-list cap', () =>
  {
    const now = 10_000
    const expiredRows = Array.from(
      { length: MAX_OWNED_SHORT_LINKS + 5 },
      (_, index) => makeRow(`expired-${index}`, now - index, now - 1 - index)
    )
    const liveRows = [
      makeRow('live-new', now + 2, now + 2_000),
      makeRow('live-old', now + 1, now + 1_000),
    ]

    const result = selectLiveOwnedShortLinks([...expiredRows, ...liveRows], now)

    expect(result.map((row) => row.slug)).toEqual(['live-new', 'live-old'])
  })

  it('preserves query order while capping live rows', () =>
  {
    const now = 10_000
    const rows = [
      makeRow('live-3', now + 3, now + 3_000),
      makeRow('live-2', now + 2, now + 2_000),
      makeRow('live-1', now + 1, now + 1_000),
    ]

    const result = selectLiveOwnedShortLinks(rows, now, 2)

    expect(result).toEqual([
      {
        slug: 'live-3',
        boardTitle: 'Board live-3',
        createdAt: now + 3,
        expiresAt: now + 3_000,
      },
      {
        slug: 'live-2',
        boardTitle: 'Board live-2',
        createdAt: now + 2,
        expiresAt: now + 2_000,
      },
    ])
  })
})
