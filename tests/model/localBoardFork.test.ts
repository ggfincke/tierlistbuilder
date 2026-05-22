// tests/model/localBoardFork.test.ts
// local marketplace fork media hydration for signed-out rendering

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { MarketplaceRankingDetail } from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  createLocalBoardFromRanking,
  createLocalBoardFromTemplate,
} from '~/features/workspace/boards/model/localBoardFork'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import {
  disposeImageBlobCache,
  getCachedImageUrl,
} from '~/shared/images/imageBlobCache'
import { getBlob } from '~/shared/images/imageStore'
import { mockObjectUrls } from '../shared-lib/objectUrl'
import { resetBoardStores } from '../shared-lib/boardStores'

let objectUrls: ReturnType<typeof mockObjectUrls> | null = null

const media: TemplateMediaRef = {
  externalId: 'media-public-template',
  contentHash: 'hash-public-template',
  url: 'https://cdn.test/template-item.png',
  width: 64,
  height: 64,
  mimeType: 'image/png',
}

const template: MarketplaceTemplateDetail = {
  slug: 'TemplateSlug1',
  title: 'Template',
  description: null,
  category: 'gaming',
  tags: [],
  visibility: 'public',
  sizeClass: 'standard',
  publicationState: 'published',
  author: { id: 'author-1', displayName: 'Author', avatarUrl: null },
  coverMedia: null,
  coverFraming: null,
  coverItems: [],
  itemAspectRatio: null,
  defaultItemImageFit: null,
  defaultItemImagePadding: 0.08,
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
  createdAt: 1,
  updatedAt: 1,
  access: 'usable',
  criteria: [],
  rankingCountByCriterion: {},
  suggestedTiers: [],
  labels: null,
}

const item: MarketplaceTemplateItem = {
  externalId: 'template-item-1',
  label: 'Template item',
  backgroundColor: null,
  mediaPlate: null,
  altText: 'Template item alt',
  media,
  order: 0,
  aspectRatio: 1,
  imageFit: 'cover',
  transform: null,
  imagePadding: 0.18,
}

const ranking: MarketplaceRankingDetail = {
  slug: 'RankingSlug1',
  title: 'Ranking',
  description: null,
  visibility: 'public',
  publicationState: 'published',
  author: { id: 'author-1', displayName: 'Author', avatarUrl: null },
  template: {
    slug: template.slug,
    title: template.title,
    category: template.category,
  },
  criterion: {
    externalId: 'default',
    name: 'Overall',
    prompt: 'Rank these items.',
  },
  itemCount: 0,
  tierCount: 0,
  remixCount: 0,
  viewCount: 0,
  featuredRank: null,
  featuredBadge: null,
  createdAt: 1,
  updatedAt: 1,
  autoPlate: { mode: 'uniform', uniformColor: '#101010' },
  defaultItemImagePadding: 0.12,
  tiers: [],
  items: [],
}

const resetStores = (): void =>
{
  resetBoardStores()
}

describe('createLocalBoardFromTemplate', () =>
{
  beforeEach(() =>
  {
    resetStores()
    objectUrls = mockObjectUrls('blob:template-item')
  })

  afterEach(() =>
  {
    disposeImageBlobCache()
    objectUrls?.restore()
    objectUrls = null
    resetStores()
  })

  it('caches public template media bytes before saving a signed-out fork', async () =>
  {
    const body = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const boardId = await createLocalBoardFromTemplate({
      template,
      templateItems: [item],
      markPendingSync: false,
    })

    expect(fetchMock).toHaveBeenCalledWith(media.url)
    expect(getCachedImageUrl(media.contentHash)).toBe('blob:template-item')
    await expect(getBlob(media.contentHash)).resolves.toMatchObject({
      hash: media.contentHash,
      mimeType: media.mimeType,
      byteSize: body.size,
    })

    const stored = loadBoardFromStorage(boardId)
    expect(stored.status).toBe('ok')
    const storedItem = Object.values(
      stored.status === 'ok' ? (stored.data.items ?? {}) : {}
    )[0]
    expect(storedItem).toMatchObject({
      imageRef: {
        hash: media.contentHash,
        cloudMediaExternalId: media.externalId,
        cloudMediaOwnership: 'source',
      },
      imagePadding: item.imagePadding,
    })
    expect(
      stored.status === 'ok' ? stored.data.defaultItemImagePadding : undefined
    ).toBe(template.defaultItemImagePadding)
  })
})

describe('createLocalBoardFromRanking', () =>
{
  beforeEach(() =>
  {
    resetStores()
  })

  afterEach(() =>
  {
    resetStores()
  })

  it('preserves the ranking source template backdrop policy', async () =>
  {
    const boardId = await createLocalBoardFromRanking({
      ranking,
      templateItems: [],
      markPendingSync: false,
    })

    const stored = loadBoardFromStorage(boardId)
    expect(stored.status).toBe('ok')
    expect(stored.status === 'ok' ? stored.data.autoPlate : undefined).toEqual(
      ranking.autoPlate
    )
    expect(
      stored.status === 'ok' ? stored.data.defaultItemImagePadding : undefined
    ).toBe(ranking.defaultItemImagePadding)
  })
})
