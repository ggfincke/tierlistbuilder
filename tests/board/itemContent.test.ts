// tests/board/itemContent.test.ts
// ItemContent rendering for image vs text variants

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ItemContent } from '~/shared/board-ui/ItemContent'
import * as imageUrlHook from '~/shared/hooks/useImageUrl'

afterEach(() =>
{
  vi.restoreAllMocks()
})

describe('ItemContent', () =>
{
  it('renders an image when useImageUrl resolves a url from imageRef', () =>
  {
    vi.spyOn(imageUrlHook, 'useImageUrl').mockReturnValue('blob:resolved-image')

    const html = renderToStaticMarkup(
      createElement(ItemContent, {
        item: {
          imageRef: { hash: 'abc' },
          label: 'Resolved item',
          altText: 'Resolved image',
        },
        showLabel: true,
      })
    )

    expect(html).toContain('src="blob:resolved-image"')
    expect(html).toContain('alt="Resolved image"')
    expect(html).toContain('Resolved item')
  })

  it('renders the text label when no image url resolves', () =>
  {
    vi.spyOn(imageUrlHook, 'useImageUrl').mockReturnValue(null)

    const html = renderToStaticMarkup(
      createElement(ItemContent, {
        item: {
          imageRef: { hash: 'abc' },
          label: 'Text fallback',
        },
      })
    )

    expect(html).not.toContain('<img')
    expect(html).toContain('Text fallback')
  })
})
