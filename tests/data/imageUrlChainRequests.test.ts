// tests/data/imageUrlChainRequests.test.ts
// image URL chain cloud request selection

import { describe, expect, it } from 'vitest'
import { collectMissingCloudImageChainRequests } from '~/shared/images/imageUrlChainRequests'
import type { ImageUrlChainSource } from '~/shared/images/imageUrlChainRequests'

const source = (
  hash: string,
  cloudMediaExternalId: string,
  variant: ImageUrlChainSource['variant'] = 'tile'
): ImageUrlChainSource => ({ hash, cloudMediaExternalId, variant })

describe('collectMissingCloudImageChainRequests', () =>
{
  it('queues missing cloud-backed sources until a cached rendition can render', () =>
  {
    const requests = collectMissingCloudImageChainRequests(
      [
        source('source-hash', 'media-source', 'editor'),
        source('tile-hash', 'media-tile', 'tile'),
        source('preview-hash', 'media-preview', 'preview'),
      ],
      () => null
    )

    expect(requests).toEqual([
      source('source-hash', 'media-source', 'editor'),
      source('tile-hash', 'media-tile', 'tile'),
      source('preview-hash', 'media-preview', 'preview'),
    ])
  })

  it('stops after the first cached rendition but still requests better missing sources', () =>
  {
    const cached = new Set(['tile-hash'])

    const requests = collectMissingCloudImageChainRequests(
      [
        source('source-hash', 'media-source', 'editor'),
        source('tile-hash', 'media-tile', 'tile'),
        source('preview-hash', 'media-preview', 'preview'),
      ],
      (hash) => (cached.has(hash) ? `blob:${hash}` : null)
    )

    expect(requests).toEqual([source('source-hash', 'media-source', 'editor')])
  })

  it('skips local-only missing sources while preserving fallback traversal', () =>
  {
    const requests = collectMissingCloudImageChainRequests(
      [
        source('source-hash', '', 'editor'),
        source('tile-hash', 'media-tile', 'tile'),
        source('preview-hash', '', 'preview'),
      ],
      () => null
    )

    expect(requests).toEqual([source('tile-hash', 'media-tile', 'tile')])
  })
})
