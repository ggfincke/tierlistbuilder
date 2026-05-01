// tests/model/urlFilters.test.ts
// marketplace gallery & library URL filter parse/serialize behavior

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
  it('parses valid values & falls back to defaults on invalid known values', () =>
  {
    expect(
      parseGalleryFilterParams(
        new URLSearchParams('q=Zelda&cat=gaming&tag=Bosses&sort=popular')
      )
    ).toEqual({
      search: 'Zelda',
      category: 'gaming',
      tag: 'bosses',
      sort: 'popular',
    })

    expect(
      parseGalleryFilterParams(
        new URLSearchParams(
          'q=%20%20&cat=invalid&tag=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&sort=oldest'
        )
      )
    ).toEqual({ search: '  ', category: null, tag: null, sort: 'recent' })
  })

  it('serializes non-defaults, prunes defaults/cleared keys, & preserves unrelated params', () =>
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

    const written = createGalleryFilterSearchParams(new URLSearchParams(), {
      search: '  Mario  ',
      tag: '  Party  ',
      sort: 'featured',
    })
    expect(written.get('q')).toBe('  Mario  ')
    expect(written.get('tag')).toBe('party')
    expect(written.get('sort')).toBe('featured')

    const whitespace = createGalleryFilterSearchParams(
      new URLSearchParams('q=zelda'),
      { search: '   ' }
    )
    expect(whitespace.has('q')).toBe(false)
  })
})

describe('library filter URL params', () =>
{
  it('parses valid values & falls back to defaults on invalid known values', () =>
  {
    expect(
      parseLibraryFilterParams(
        new URLSearchParams(
          'q=Roadmap&status=published&sort=progress&view=list&density=loose'
        )
      )
    ).toEqual({
      search: 'Roadmap',
      filter: 'published',
      sort: 'progress',
      view: 'list',
      density: 'loose',
    })

    expect(
      parseLibraryFilterParams(
        new URLSearchParams(
          'q=%20%20&status=archived&sort=rating&view=kanban&density=giant'
        )
      )
    ).toEqual({
      search: '  ',
      filter: 'all',
      sort: 'updated',
      view: 'grid',
      density: 'default',
    })
  })

  it('serializes non-defaults & prunes default values', () =>
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
})
