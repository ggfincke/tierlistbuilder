// tests/model/templatesGalleryRailVisibility.test.ts
// Rail visibility predicates should match each rail's ordering signal.

import { describe, expect, it } from 'vitest'
import type { MarketplaceTemplateGalleryCard } from '@tierlistbuilder/contracts/marketplace/template'
import {
  hasPopularRailActivity,
  hasTrendingRailActivity,
} from '~/features/marketplace/model/gallery/useTemplatesGallery'

const card = (
  overrides: Partial<MarketplaceTemplateGalleryCard> = {}
): MarketplaceTemplateGalleryCard => ({
  slug: 'Template001',
  title: 'Template',
  description: null,
  category: 'gaming',
  tags: [],
  visibility: 'public',
  sizeClass: 'standard',
  publicationState: 'published',
  author: {
    id: 'author',
    displayName: 'Author',
    avatarUrl: null,
  },
  coverMedia: null,
  coverFraming: null,
  coverItems: [],
  itemAspectRatio: null,
  defaultItemImageFit: null,
  defaultItemImagePadding: null,
  autoPlate: null,
  itemCount: 1,
  forkCount: 0,
  viewCount: 0,
  rankingCount: 0,
  weeklyForkCount: 0,
  weeklyViewCount: 0,
  trendingScore: 0,
  trendingComputedAt: null,
  featuredRank: null,
  creditLine: null,
  createdAt: 0,
  updatedAt: 0,
  access: 'usable',
  ...overrides,
})

describe('template gallery rail visibility', () =>
{
  it('keeps the trending rail tied to weekly activity density', () =>
  {
    expect(hasTrendingRailActivity(undefined)).toBe(true)
    expect(
      hasTrendingRailActivity([
        card({ weeklyViewCount: 1 }),
        card({ weeklyForkCount: 1 }),
      ])
    ).toBe(false)
    expect(
      hasTrendingRailActivity([
        card({ weeklyViewCount: 1 }),
        card({ weeklyForkCount: 1 }),
        card({ weeklyViewCount: 2 }),
      ])
    ).toBe(true)
  })

  it('keeps the popular rail tied to all-time forks', () =>
  {
    expect(hasPopularRailActivity(undefined)).toBe(true)
    expect(hasPopularRailActivity([card({ forkCount: 0 })])).toBe(false)
    expect(hasPopularRailActivity([card({ forkCount: 4 })])).toBe(true)
  })
})
