// tests/ui/libraryCover.test.tsx
// My Boards cover rendering for populated draft rows vs truly empty boards.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Cover } from '~/features/library/components/Cover'
import type { LibraryBoardCoverItem } from '@tierlistbuilder/contracts/workspace/board'
import type {
  TemplateCoverFraming,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'

const sourceCoverMedia: TemplateMediaRef = {
  externalId: 'ssbu-cover',
  contentHash: 'hash-ssbu-cover',
  url: 'https://cdn.test/ssbu-banner.jpg',
  width: 1920,
  height: 1080,
  mimeType: 'image/jpeg',
}

const sourceCoverFraming: TemplateCoverFraming = {
  browseHero: null,
  detailHero: null,
  card: { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
}

const renderCover = (
  items: LibraryBoardCoverItem[],
  title = 'Super Board',
  options: {
    sourceCoverMedia?: TemplateMediaRef | null
    sourceCoverFraming?: TemplateCoverFraming | null
  } = {}
) =>
  renderToStaticMarkup(
    <div className="relative h-44 w-full">
      <Cover
        items={items}
        density="default"
        sourceCoverMedia={options.sourceCoverMedia}
        sourceCoverFraming={options.sourceCoverFraming}
        title={title}
      />
    </div>
  )

describe('library Cover', () =>
{
  it('renders cover items even when the board is still a draft', () =>
  {
    const markup = renderCover([
      {
        externalId: 'item-mario',
        label: 'Mario',
        mediaUrl: null,
      },
    ])

    expect(markup).toContain('Mario')
    expect(markup).not.toContain('font-black')
  })

  it('prefers a source template cover over the item mosaic', () =>
  {
    const markup = renderCover(
      [
        {
          externalId: 'item-mario',
          label: 'Mario',
          mediaUrl: null,
        },
      ],
      'Super Smash Bros. Ultimate roster',
      { sourceCoverMedia, sourceCoverFraming }
    )

    expect(markup).toContain('absolute inset-0 overflow-hidden')
    expect(markup).not.toContain('Mario')
    expect(markup).not.toContain('font-black')
  })

  it('renders the ghost initial only for empty covers', () =>
  {
    const markup = renderCover([], 'Smash')

    expect(markup).toContain('font-black')
    expect(markup).toContain('S')
  })
})
