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
  it('renders inline imageUrl fallback when imageRef is unavailable', () =>
  {
    vi.spyOn(imageUrlHook, 'useImageUrl').mockReturnValue(null)

    const html = renderToStaticMarkup(
      createElement(ItemContent, {
        item: {
          imageUrl: 'blob:export-image',
          label: 'Exported item',
          altText: 'Inline image fallback',
        },
        showLabel: true,
      })
    )

    expect(html).toContain('src="blob:export-image"')
    expect(html).toContain('alt="Inline image fallback"')
    expect(html).toContain('Exported item')
  })
})
