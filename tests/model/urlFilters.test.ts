// tests/model/urlFilters.test.ts
// URL param parser / serializer coverage for marketplace & library filters

import { describe, expect, it } from 'vitest'

import {
  createLibraryFilterSearchParams,
  parseLibraryFilterParams,
} from '~/features/library/model/useLibraryFilters'
import {
  createGalleryFilterSearchParams,
  parseGalleryFilterParams,
} from '~/features/marketplace/model/useGalleryFilters'

describe('gallery filter URL params', () =>
{
  it('parses valid values from query params', () =>
  {
    const filters = parseGalleryFilterParams(
      new URLSearchParams('q=Zelda&cat=gaming&tag=Bosses&sort=popular')
    )

    expect(filters).toEqual({
      search: 'Zelda',
      category: 'gaming',
      tag: 'bosses',
      sort: 'popular',
    })
  })

  it('falls back to defaults for invalid known values', () =>
  {
    const filters = parseGalleryFilterParams(
      new URLSearchParams(
        'q=%20%20&cat=invalid&tag=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&sort=oldest'
      )
    )

    expect(filters).toEqual({
      search: '  ',
      category: null,
      tag: null,
      sort: 'recent',
    })
  })

  it('canonicalizes known keys while preserving unrelated params', () =>
  {
    const next = createGalleryFilterSearchParams(
      new URLSearchParams(
        'keep=1&q=%20Zelda%20&cat=invalid&tag=Bosses&sort=recent'
      ),
      {}
    )

    expect(next.get('keep')).toBe('1')
    expect(next.get('q')).toBe(' Zelda ')
    expect(next.has('cat')).toBe(false)
    expect(next.get('tag')).toBe('bosses')
    expect(next.has('sort')).toBe(false)
  })

  it('writes non-default values and deletes cleared values', () =>
  {
    const next = createGalleryFilterSearchParams(
      new URLSearchParams('keep=1&q=zelda&cat=gaming&tag=bosses&sort=popular'),
      {
        search: '',
        category: null,
        tag: null,
        sort: 'recent',
      }
    )

    expect(next.get('keep')).toBe('1')
    expect(next.has('q')).toBe(false)
    expect(next.has('cat')).toBe(false)
    expect(next.has('tag')).toBe(false)
    expect(next.has('sort')).toBe(false)
  })

  it('normalizes patched tag values and preserves search text', () =>
  {
    const next = createGalleryFilterSearchParams(new URLSearchParams(), {
      search: '  Mario  ',
      tag: '  Party  ',
      sort: 'featured',
    })

    expect(next.get('q')).toBe('  Mario  ')
    expect(next.get('tag')).toBe('party')
    expect(next.get('sort')).toBe('featured')
  })

  it('deletes whitespace-only search values', () =>
  {
    const next = createGalleryFilterSearchParams(
      new URLSearchParams('q=zelda'),
      {
        search: '   ',
      }
    )

    expect(next.has('q')).toBe(false)
  })
})

describe('library filter URL params', () =>
{
  it('parses valid values from query params', () =>
  {
    const filters = parseLibraryFilterParams(
      new URLSearchParams(
        'q=Roadmap&status=published&sort=progress&view=list&density=loose'
      )
    )

    expect(filters).toEqual({
      search: 'Roadmap',
      filter: 'published',
      sort: 'progress',
      view: 'list',
      density: 'loose',
    })
  })

  it('falls back to defaults for invalid known values', () =>
  {
    const filters = parseLibraryFilterParams(
      new URLSearchParams(
        'q=%20%20&status=archived&sort=rating&view=kanban&density=giant'
      )
    )

    expect(filters).toEqual({
      search: '  ',
      filter: 'all',
      sort: 'updated',
      view: 'grid',
      density: 'default',
    })
  })

  it('canonicalizes known keys while preserving unrelated params', () =>
  {
    const next = createLibraryFilterSearchParams(
      new URLSearchParams(
        'keep=1&q=%20Roadmap%20&status=bad&sort=updated&view=grid&density=default'
      ),
      {}
    )

    expect(next.get('keep')).toBe('1')
    expect(next.get('q')).toBe(' Roadmap ')
    expect(next.has('status')).toBe(false)
    expect(next.has('sort')).toBe(false)
    expect(next.has('view')).toBe(false)
    expect(next.has('density')).toBe(false)
  })

  it('writes non-default values and deletes default values', () =>
  {
    const next = createLibraryFilterSearchParams(
      new URLSearchParams('keep=1&q=roadmap&status=published&sort=progress'),
      {
        search: '',
        filter: 'all',
        sort: 'updated',
        view: 'list',
        density: 'dense',
      }
    )

    expect(next.get('keep')).toBe('1')
    expect(next.has('q')).toBe(false)
    expect(next.has('status')).toBe(false)
    expect(next.has('sort')).toBe(false)
    expect(next.get('view')).toBe('list')
    expect(next.get('density')).toBe('dense')
  })

  it('deletes whitespace-only search values', () =>
  {
    const next = createLibraryFilterSearchParams(
      new URLSearchParams('q=roadmap'),
      {
        search: '   ',
      }
    )

    expect(next.has('q')).toBe(false)
  })
})
