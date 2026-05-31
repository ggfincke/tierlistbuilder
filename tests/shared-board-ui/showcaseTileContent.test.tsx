// tests/shared-board-ui/showcaseTileContent.test.tsx
// showcase tile render regressions

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MarketplaceItemRenderFields } from '@tierlistbuilder/contracts/marketplace/template'
import type {
  ShowcaseMiniSnapshot,
  ShowcaseRankingTile,
} from '@tierlistbuilder/contracts/platform/showcase'
import { ShowcaseTileContent } from '~/shared/board-ui/ShowcaseTileContent'

const media = {
  externalId: 'media-1',
  contentHash: 'hash-1',
  url: 'https://example.test/logo.png',
  width: 64,
  height: 64,
  mimeType: 'image/png',
}

const item = (
  label: string,
  patch: Partial<MarketplaceItemRenderFields> = {}
): MarketplaceItemRenderFields => ({
  label,
  backgroundColor: null,
  mediaPlate: null,
  altText: null,
  media,
  order: 0,
  aspectRatio: null,
  imageFit: null,
  transform: null,
  imagePadding: null,
  ...patch,
})

const mini = (
  patch: Partial<ShowcaseMiniSnapshot> = {}
): ShowcaseMiniSnapshot => ({
  tiers: [
    {
      name: 'S',
      colorSpec: { kind: 'palette', index: 0 },
      rowColorSpec: null,
      items: [item('S Pick')],
    },
  ],
  itemAspectRatio: null,
  autoPlate: null,
  ...patch,
})

const tile = (snapshot: ShowcaseMiniSnapshot): ShowcaseRankingTile => ({
  boardExternalId: 'board-1',
  rankingSlug: 'Ranking001',
  title: 'Ranking',
  cover: null,
  mini: snapshot,
})

describe('ShowcaseTileContent', () =>
{
  it('applies auto-plates in cropped mode', () =>
  {
    const html = renderToStaticMarkup(
      <ShowcaseTileContent
        tile={tile(
          mini({
            autoPlate: { mode: 'auto' },
            tiers: [
              {
                name: 'S',
                colorSpec: { kind: 'palette', index: 0 },
                rowColorSpec: null,
                items: [item('Dark Logo', { mediaPlate: 'light' })],
              },
            ],
          })
        )}
        title="Ranking"
      />
    )

    expect(html).toContain('background-color:var(--t-media-plate-light)')
  })
})
