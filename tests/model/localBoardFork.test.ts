// tests/model/localBoardFork.test.ts
// local marketplace fork media hydration for signed-out rendering

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import { createLocalBoardFromTemplate } from '~/features/workspace/boards/model/localBoardFork'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  disposeImageBlobCache,
  getCachedImageUrl,
} from '~/shared/images/imageBlobCache'
import { getBlob } from '~/shared/images/imageStore'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL'
)
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL'
)

const restoreUrlMethod = (
  key: 'createObjectURL' | 'revokeObjectURL',
  descriptor: PropertyDescriptor | undefined
): void =>
{
  if (descriptor)
  {
    Object.defineProperty(URL, key, descriptor)
    return
  }

  delete (URL as typeof URL & Partial<Record<typeof key, unknown>>)[key]
}

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
  altText: 'Template item alt',
  media,
  order: 0,
  aspectRatio: 1,
  imageFit: 'cover',
  transform: null,
}

const resetStores = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({ boards: [], activeBoardId: null })
  useActiveBoardStore.setState({
    ...createInitialBoardData('classic'),
    past: [],
    future: [],
    activeItemId: null,
    dragPreview: null,
    dragGroupIds: [],
    keyboardMode: 'idle',
    keyboardFocusItemId: null,
    selection: { ids: [], set: new Set() },
    lastClickedItemId: null,
    itemsManuallyMoved: false,
    activeItemCount: 0,
    runtimeError: null,
    lastSyncedRevision: null,
    cloudBoardExternalId: null,
    pendingSyncAt: null,
  })
}

describe('createLocalBoardFromTemplate', () =>
{
  beforeEach(() =>
  {
    resetStores()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:template-item'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
  })

  afterEach(() =>
  {
    disposeImageBlobCache()
    restoreUrlMethod('createObjectURL', originalCreateObjectUrl)
    restoreUrlMethod('revokeObjectURL', originalRevokeObjectUrl)
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
    })
  })
})
