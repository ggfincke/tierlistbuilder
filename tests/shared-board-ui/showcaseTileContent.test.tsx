// tests/shared-board-ui/showcaseTileContent.test.tsx
// showcase tile render regressions

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
      itemCount: 1,
      items: [item('S Pick')],
      labels: ['S Pick'],
    },
  ],
  itemAspectRatio: null,
  autoPlate: null,
  topPickLabel: 'S Pick',
  bottomPickLabel: 'S Pick',
  rankedCount: 1,
  updatedAt: 1_000,
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
  it('applies auto-plates in full mini mode', () =>
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
                itemCount: 1,
                items: [item('Dark Logo', { mediaPlate: 'light' })],
                labels: ['Dark Logo'],
              },
            ],
          })
        )}
        tileMode="mini"
        title="Ranking"
      />
    )

    expect(html).toContain('background-color:var(--t-media-plate-light)')
  })

  it('renders winners labels from snapshot picks instead of shown tiers', () =>
  {
    const html = renderToStaticMarkup(
      <ShowcaseTileContent
        tile={tile(
          mini({
            tiers: [
              {
                name: 'S',
                colorSpec: { kind: 'palette', index: 0 },
                rowColorSpec: null,
                itemCount: 1,
                items: [item('S Pick')],
                labels: ['S Pick'],
              },
              {
                name: 'C',
                colorSpec: { kind: 'palette', index: 3 },
                rowColorSpec: null,
                itemCount: 1,
                items: [item('C Pick')],
                labels: ['C Pick'],
              },
            ],
            bottomPickLabel: 'F Pick',
            rankedCount: 6,
          })
        )}
        tileMode="winners"
        title="Ranking"
      />
    )

    expect(html).toContain('F Pick')
    expect(html).not.toContain('C Pick')
  })
})
